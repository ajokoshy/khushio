import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { articles, brands, categories, merchants, pages, products, seoMetadata } from "@/core/database/schema";
import { visibleProductCondition } from "@/core/catalog/visibility";
import { escapeLike } from "@/core/validation/like";
import { hasAnySeo, type SeoFields } from "@/modules/content/types";
import { visibleArticleCondition, visiblePageCondition } from "@/modules/content/visibility";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX, seoIssues } from "./metadata";
import { SITEMAP_CHUNK } from "./sitemap";
import { PUBLIC_PATHS } from "@/modules/redirects/types";
import type { AuditRow, AuditType, EntitySummary, OverrideType, SeoEntityType } from "./types";

/** Repository: the only code in this module that talks to the database. */

/* ================================== search overrides (seo_metadata) ================================== */

export async function selectOverride(entityType: SeoEntityType, entityId: string): Promise<SeoFields | null> {
  const [row] = await db()
    .select({ title: seoMetadata.title, description: seoMetadata.description, canonical: seoMetadata.canonical, ogImage: seoMetadata.ogImage, robots: seoMetadata.robots })
    .from(seoMetadata)
    .where(and(eq(seoMetadata.entityType, entityType), eq(seoMetadata.entityId, entityId)))
    .limit(1);
  return row ? { ...row, robots: row.robots as SeoFields["robots"] } : null;
}

/** Saves the fields, or removes the row when every field is empty. */
export async function upsertOverride(entityType: SeoEntityType, entityId: string, seo: SeoFields): Promise<void> {
  if (!hasAnySeo(seo)) {
    await db().delete(seoMetadata).where(and(eq(seoMetadata.entityType, entityType), eq(seoMetadata.entityId, entityId)));
    return;
  }
  await db()
    .insert(seoMetadata)
    .values({ entityType, entityId, ...seo })
    .onConflictDoUpdate({ target: [seoMetadata.entityType, seoMetadata.entityId], set: { ...seo, updatedAt: new Date() } });
}

export async function selectEntity(type: OverrideType, id: string): Promise<EntitySummary | null> {
  const d = db();
  const pick = async (): Promise<{ id: string; slug: string; name: string } | undefined> => {
    switch (type) {
      case "product": return (await d.select({ id: products.id, slug: products.slug, name: products.name }).from(products).where(eq(products.id, id)).limit(1))[0];
      case "category": return (await d.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories).where(eq(categories.id, id)).limit(1))[0];
      case "brand": return (await d.select({ id: brands.id, slug: brands.slug, name: brands.name }).from(brands).where(eq(brands.id, id)).limit(1))[0];
      case "store": return (await d.select({ id: merchants.id, slug: merchants.slug, name: merchants.name }).from(merchants).where(eq(merchants.id, id)).limit(1))[0];
    }
  };
  const row = await pick();
  return row ? { type, ...row, path: PUBLIC_PATHS[type === "product" ? "product" : type === "category" ? "category" : type === "brand" ? "brand" : "store"](row.slug) } : null;
}

/* ================================== the audit list ================================== */

type AuditConfig = {
  table: typeof products | typeof categories | typeof brands | typeof merchants | typeof articles | typeof pages;
  id: SQL;
  slug: SQL<string>;
  name: SQL<string>;
  /** The item's own hand-written description text, when the table has one. */
  own: SQL<string | null>;
  /** Only pages a visitor can reach are worth checking. */
  where: SQL;
  /** Whether a missing description is a problem (otherwise a sentence is generated from text the page really has). */
  requiresOwn: boolean;
  path: (slug: string) => string;
};

const AUDIT: Record<AuditType, AuditConfig> = {
  product: { table: products, id: sql`${products.id}`, slug: sql<string>`${products.slug}`, name: sql<string>`${products.name}`, own: sql<string | null>`coalesce(nullif(trim(${products.summary}), ''), nullif(trim(${products.description}), ''))`, where: visibleProductCondition(), requiresOwn: true, path: PUBLIC_PATHS.product },
  category: { table: categories, id: sql`${categories.id}`, slug: sql<string>`${categories.slug}`, name: sql<string>`${categories.name}`, own: sql<string | null>`nullif(trim(${categories.description}), '')`, where: sql`${categories.isActive}`, requiresOwn: true, path: PUBLIC_PATHS.category },
  brand: { table: brands, id: sql`${brands.id}`, slug: sql<string>`${brands.slug}`, name: sql<string>`${brands.name}`, own: sql<string | null>`nullif(trim(${brands.description}), '')`, where: sql`${brands.isActive}`, requiresOwn: true, path: PUBLIC_PATHS.brand },
  store: { table: merchants, id: sql`${merchants.id}`, slug: sql<string>`${merchants.slug}`, name: sql<string>`${merchants.name}`, own: sql<string | null>`null`, where: sql`${merchants.isActive}`, requiresOwn: true, path: PUBLIC_PATHS.store },
  article: { table: articles, id: sql`${articles.id}`, slug: sql<string>`${articles.slug}`, name: sql<string>`${articles.title}`, own: sql<string | null>`nullif(trim(${articles.excerpt}), '')`, where: visibleArticleCondition(), requiresOwn: false, path: PUBLIC_PATHS.article },
  page: { table: pages, id: sql`${pages.id}`, slug: sql<string>`${pages.slug}`, name: sql<string>`${pages.title}`, own: sql<string | null>`null`, where: visiblePageCondition(), requiresOwn: false, path: PUBLIC_PATHS.page },
};

/** The SQL twin of seoIssues() in metadata.ts: "this row has something to improve". */
function issueCondition(cfg: AuditConfig): SQL {
  const title = sql`coalesce(nullif(trim(${seoMetadata.title}), ''), ${cfg.name})`;
  const description = sql`coalesce(nullif(trim(${seoMetadata.description}), ''), ${cfg.own})`;
  const missing = cfg.requiresOwn ? sql`${description} is null` : sql`false`;
  return sql`(length(${title}) > ${TITLE_MAX} or ${missing} or (${description} is not null and (length(${description}) < ${DESCRIPTION_MIN} or length(${description}) > ${DESCRIPTION_MAX})))`;
}

export async function selectAudit(type: AuditType, opts: { q?: string; onlyIssues: boolean; limit: number; offset: number }): Promise<AuditRow[]> {
  const cfg = AUDIT[type];
  const pattern = opts.q ? `%${escapeLike(opts.q.trim())}%` : null;
  const rows = await db()
    .select({ id: cfg.id.as("entity_id"), slug: cfg.slug.as("entity_slug"), name: cfg.name.as("entity_name"), own: cfg.own.as("own_description"), overrideTitle: seoMetadata.title, overrideDescription: seoMetadata.description, robots: seoMetadata.robots })
    .from(cfg.table as typeof products)
    .leftJoin(seoMetadata, and(eq(seoMetadata.entityType, type), sql`${seoMetadata.entityId} = ${cfg.id}`))
    .where(and(cfg.where, pattern ? sql`${cfg.name} ilike ${pattern}` : undefined, opts.onlyIssues ? issueCondition(cfg) : undefined))
    .orderBy(asc(sql`lower(${cfg.name})`), asc(cfg.id))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows.map((r) => {
    const id = String(r.id);
    const slug = String(r.slug);
    const name = String(r.name);
    const own = (r.own as string | null) ?? null;
    return {
      type,
      id,
      slug,
      name,
      path: cfg.path(slug),
      overrideTitle: r.overrideTitle ?? null,
      overrideDescription: r.overrideDescription ?? null,
      robots: r.robots ?? null,
      issues: seoIssues({ title: r.overrideTitle?.trim() || name, ownDescription: r.overrideDescription?.trim() || own, requiresOwnDescription: cfg.requiresOwn }),
    };
  });
}

/** How many pages of each kind need attention, for the tabs on /admin/seo. */
export async function countAuditIssues(): Promise<Record<AuditType, number>> {
  const out = {} as Record<AuditType, number>;
  await Promise.all(
    (Object.keys(AUDIT) as AuditType[]).map(async (type) => {
      const cfg = AUDIT[type];
      const [row] = await db()
        .select({ n: count() })
        .from(cfg.table as typeof products)
        .leftJoin(seoMetadata, and(eq(seoMetadata.entityType, type), sql`${seoMetadata.entityId} = ${cfg.id}`))
        .where(and(cfg.where, issueCondition(cfg)));
      out[type] = Number(row?.n ?? 0);
    }),
  );
  return out;
}

/* ================================== sitemap lists ================================== */

const notNoindex = (type: SeoEntityType, id: SQL) => sql`not exists (select 1 from ${seoMetadata} where ${seoMetadata.entityType} = ${type} and ${seoMetadata.entityId} = ${id} and ${seoMetadata.robots} is not null)`;

export const countSitemapProducts = async (): Promise<number> => {
  const [row] = await db().select({ n: count() }).from(products).where(and(visibleProductCondition(), notNoindex("product", sql`${products.id}`)));
  return Number(row?.n ?? 0);
};

export const selectSitemapProducts = (limit: number, offset: number): Promise<{ slug: string; updatedAt: Date }[]> =>
  db().select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(and(visibleProductCondition(), notNoindex("product", sql`${products.id}`))).orderBy(desc(products.updatedAt), asc(products.id)).limit(limit).offset(offset);

/** Active categories that are not thin: a visible product in them, or an active subcategory to browse. Same rule as the page's own noindex. */
export async function selectSitemapCategories(): Promise<string[]> {
  const rows = await db()
    .select({ slug: categories.slug })
    .from(categories)
    .where(and(
      eq(categories.isActive, true),
      notNoindex("category", sql`${categories.id}`),
      sql`(exists (select 1 from product_categories pc join ${products} on ${products.id} = pc.product_id where pc.category_id = ${categories.id} and ${visibleProductCondition()}) or exists (select 1 from categories c where c.parent_id = ${categories.id} and c.is_active))`,
    ))
    .orderBy(asc(categories.slug))
    .limit(SITEMAP_CHUNK);
  return rows.map((r) => r.slug);
}

export async function selectSitemapBrands(): Promise<string[]> {
  const rows = await db()
    .select({ slug: brands.slug })
    .from(brands)
    .where(and(eq(brands.isActive, true), notNoindex("brand", sql`${brands.id}`), sql`exists (select 1 from ${products} where ${products.brandId} = ${brands.id} and ${visibleProductCondition()})`))
    .orderBy(asc(brands.slug))
    .limit(SITEMAP_CHUNK);
  return rows.map((r) => r.slug);
}

export async function selectSitemapStores(): Promise<string[]> {
  const rows = await db()
    .select({ slug: merchants.slug })
    .from(merchants)
    .where(and(eq(merchants.isActive, true), notNoindex("store", sql`${merchants.id}`), sql`exists (select 1 from affiliate_links l join ${products} on ${products.id} = l.product_id where l.merchant_id = ${merchants.id} and l.is_active and ${visibleProductCondition()})`))
    .orderBy(asc(merchants.slug))
    .limit(SITEMAP_CHUNK);
  return rows.map((r) => r.slug);
}

