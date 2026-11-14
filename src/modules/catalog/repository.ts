import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { visibleProductCondition } from "@/core/catalog/visibility";
import {
  affiliateLinks,
  brands,
  collectionProducts,
  merchants,
  productAttributes,
  productCategories,
  productCollections,
  productImages,
  products,
  productTags,
  productVariants,
} from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import { encodeCursor, type Cursor } from "./cursor";
import type { CatalogCard, ProductDetailPublic, Sort } from "./types";

/**
 * Repository for the PUBLIC side: every query here goes through visibleProductCondition(), so a draft, archived or
 * not-yet-scheduled product can never be returned. The site currency is INR; prices in other currencies are not shown in lists.
 */

const SITE_CURRENCY = "INR";

/* ------------------------------ card building ------------------------------ */

const minPrice = sql<number | null>`(select min(${productVariants.priceMinor}) from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.currency} = ${SITE_CURRENCY} and ${productVariants.priceMinor} is not null)`;
const maxPrice = sql<number | null>`(select max(${productVariants.priceMinor}) from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.currency} = ${SITE_CURRENCY} and ${productVariants.priceMinor} is not null)`;
const firstImage = sql<string | null>`(select ${productImages.publicId} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder}, ${productImages.id} limit 1)`;
const firstImageAlt = sql<string | null>`(select ${productImages.alt} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder}, ${productImages.id} limit 1)`;

const cardColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  summary: products.summary,
  brandName: brands.name,
  brandSlug: brands.slug,
  imagePublicId: firstImage,
  imageAlt: firstImageAlt,
  minPriceMinor: minPrice,
  maxPriceMinor: maxPrice,
};

/** Only active brands are shown on cards. */
const activeBrandJoin = and(eq(brands.id, products.brandId), eq(brands.isActive, true));

const toCard = (r: { [K in keyof typeof cardColumns]: unknown }): CatalogCard => ({
  id: r.id as string,
  slug: r.slug as string,
  name: r.name as string,
  summary: (r.summary as string | null) ?? null,
  brandName: (r.brandName as string | null) ?? null,
  brandSlug: (r.brandSlug as string | null) ?? null,
  imagePublicId: (r.imagePublicId as string | null) ?? null,
  imageAlt: (r.imageAlt as string | null) ?? null,
  minPriceMinor: r.minPriceMinor === null || r.minPriceMinor === undefined ? null : Number(r.minPriceMinor),
  maxPriceMinor: r.maxPriceMinor === null || r.maxPriceMinor === undefined ? null : Number(r.maxPriceMinor),
});

/* -------------------------------- listings -------------------------------- */

export type ListQuery = {
  q?: string;
  mode: "fts" | "fuzzy";
  brandId?: string;
  categoryIds?: readonly string[];
  merchantId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: Sort;
  cursor: Cursor | null;
  limit: number;
};

function searchParts(q: string, mode: "fts" | "fuzzy"): { cond: SQL; rank: SQL } {
  const lower = q.toLowerCase();
  if (mode === "fuzzy") {
    // `%` is pg_trgm similarity (default threshold 0.3) and uses products_name_trgm_idx.
    return {
      cond: sql`lower(${products.name}) % ${lower}`,
      rank: sql`round(similarity(lower(${products.name}), ${lower})::numeric, 4)`,
    };
  }
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const contains = `%${escapeLike(lower)}%`;
  const prefix = `${escapeLike(lower)}%`;
  return {
    cond: sql`(${products.searchVector} @@ ${tsq}
      or exists (select 1 from ${brands} where ${brands.id} = ${products.brandId} and ${brands.isActive} and lower(${brands.name}) like ${contains})
      or exists (select 1 from ${productTags} where ${productTags.productId} = ${products.id} and ${productTags.tag} = ${lower}))`,
    // Text rank, plus a bonus for an exact name and a smaller one for a name that starts with the search.
    rank: sql`round((ts_rank_cd(${products.searchVector}, ${tsq})::numeric + (case when lower(${products.name}) = ${lower} then 1.0 when lower(${products.name}) like ${prefix} then 0.5 else 0.0 end)), 4)`,
  };
}

/**
 * One page of visible products. Reads limit + 1 rows: the extra one says whether a next page exists, and the last
 * row kept supplies the cursor, so no count query and no OFFSET are needed (pages stay fast and stable).
 */
export async function selectCards(query: ListQuery): Promise<{ cards: CatalogCard[]; nextCursor: string | null }> {
  const search = query.q ? searchParts(query.q, query.mode) : null;
  const relevance = query.sort === "relevance" && search !== null;

  const conditions: (SQL | undefined)[] = [visibleProductCondition()];
  if (search) conditions.push(search.cond);
  if (query.brandId) conditions.push(eq(products.brandId, query.brandId));
  if (query.categoryIds && query.categoryIds.length > 0) {
    conditions.push(sql`exists (select 1 from ${productCategories} where ${productCategories.productId} = ${products.id} and ${inArray(productCategories.categoryId, [...query.categoryIds])})`);
  }
  if (query.merchantId) {
    conditions.push(sql`exists (select 1 from ${affiliateLinks} where ${affiliateLinks.productId} = ${products.id} and ${affiliateLinks.merchantId} = ${query.merchantId} and ${affiliateLinks.isActive})`);
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    conditions.push(sql`exists (select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.currency} = ${SITE_CURRENCY} and ${productVariants.priceMinor} is not null
      ${query.minPrice !== undefined ? sql`and ${productVariants.priceMinor} >= ${query.minPrice}` : sql``}
      ${query.maxPrice !== undefined ? sql`and ${productVariants.priceMinor} <= ${query.maxPrice}` : sql``})`);
  }

  const c = query.cursor;
  if (c?.s === "new" && query.sort === "new") conditions.push(sql`(${products.createdAt}, ${products.id}) < (${c.c}::timestamptz, ${c.id}::uuid)`);
  if (c?.s === "name" && query.sort === "name") conditions.push(sql`(lower(${products.name}), ${products.id}) > (${c.n}, ${c.id}::uuid)`);
  if (c?.s === "rank" && relevance && search) conditions.push(sql`(${search.rank}, ${products.id}) < (${c.r}::numeric, ${c.id}::uuid)`);

  const orderBy = relevance && search ? [desc(search.rank), desc(products.id)] : query.sort === "name" ? [asc(sql`lower(${products.name})`), asc(products.id)] : [desc(products.createdAt), desc(products.id)];

  const rows = await db()
    .select({
      ...cardColumns,
      createdText: sql<string>`${products.createdAt}::text`,
      nameKey: sql<string>`lower(${products.name})`,
      rankText: search ? sql<string>`${search.rank}::text` : sql<string>`'0'`,
    })
    .from(products)
    .leftJoin(brands, activeBrandJoin)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  let nextCursor: string | null = null;
  if (rows.length > query.limit && last) {
    nextCursor = encodeCursor(
      relevance && search
        ? { s: "rank", r: last.rankText, id: last.id, m: query.mode }
        : query.sort === "name"
          ? { s: "name", n: last.nameKey, id: last.id }
          : { s: "new", c: last.createdText, id: last.id },
    );
  }
  return { cards: page.map(toCard), nextCursor };
}

/** Products of a curated collection in the order the admin set, capped (collections are short lists). */
export async function selectCollectionCards(collectionId: string, limit: number): Promise<CatalogCard[]> {
  const rows = await db()
    .select(cardColumns)
    .from(collectionProducts)
    .innerJoin(products, eq(products.id, collectionProducts.productId))
    .leftJoin(brands, activeBrandJoin)
    .where(and(eq(collectionProducts.collectionId, collectionId), visibleProductCondition()))
    .orderBy(asc(collectionProducts.sortOrder), asc(products.id))
    .limit(limit);
  return rows.map(toCard);
}

export async function selectCollectionBySlug(slug: string) {
  const [row] = await db()
    .select({ id: productCollections.id, slug: productCollections.slug, name: productCollections.name, description: productCollections.description })
    .from(productCollections)
    .where(and(eq(productCollections.slug, slug), eq(productCollections.isActive, true)))
    .limit(1);
  return row ?? null;
}

/** Same primary category or same brand, newest first, never the product itself. Products sharing both come first. */
export async function selectRelatedCards(productId: string, primaryCategoryId: string | null, brandId: string | null, limit: number): Promise<CatalogCard[]> {
  const sameCategory = primaryCategoryId
    ? sql`exists (select 1 from ${productCategories} where ${productCategories.productId} = ${products.id} and ${productCategories.categoryId} = ${primaryCategoryId} and ${productCategories.isPrimary})`
    : sql`false`;
  const sameBrand = brandId ? sql`${products.brandId} = ${brandId}` : sql`false`;
  const rows = await db()
    .select(cardColumns)
    .from(products)
    .leftJoin(brands, activeBrandJoin)
    .where(and(visibleProductCondition(), sql`${products.id} <> ${productId}`, sql`(${sameCategory} or ${sameBrand})`))
    .orderBy(desc(sql`((case when ${sameCategory} then 1 else 0 end) + (case when ${sameBrand} then 1 else 0 end))`), desc(products.createdAt), desc(products.id))
    .limit(limit);
  return rows.map(toCard);
}

/* ------------------------------- product page ------------------------------- */

export async function selectProductPage(slug: string): Promise<ProductDetailPublic | null> {
  const [p] = await db()
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      summary: products.summary,
      description: products.description,
      brandName: brands.name,
      brandSlug: brands.slug,
    })
    .from(products)
    .leftJoin(brands, activeBrandJoin)
    .where(and(eq(products.slug, slug), visibleProductCondition()))
    .limit(1);
  if (!p) return null;

  const [variants, images, attributes, tags, primary, links] = await Promise.all([
    db()
      .select({ id: productVariants.id, label: productVariants.label, sku: productVariants.sku, priceMinor: productVariants.priceMinor, currency: productVariants.currency })
      .from(productVariants)
      .where(eq(productVariants.productId, p.id))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt), asc(productVariants.id)),
    db().select({ publicId: productImages.publicId, alt: productImages.alt }).from(productImages).where(eq(productImages.productId, p.id)).orderBy(asc(productImages.sortOrder), asc(productImages.id)),
    db().select({ name: productAttributes.name, value: productAttributes.value }).from(productAttributes).where(eq(productAttributes.productId, p.id)).orderBy(asc(productAttributes.id)),
    db().select({ tag: productTags.tag }).from(productTags).where(eq(productTags.productId, p.id)).orderBy(asc(productTags.tag)),
    db().select({ categoryId: productCategories.categoryId }).from(productCategories).where(and(eq(productCategories.productId, p.id), eq(productCategories.isPrimary, true))).limit(1),
    db()
      .select({ slug: affiliateLinks.slug, merchantName: merchants.name })
      .from(affiliateLinks)
      .innerJoin(merchants, eq(merchants.id, affiliateLinks.merchantId))
      .where(and(eq(affiliateLinks.productId, p.id), eq(affiliateLinks.isActive, true), eq(merchants.isActive, true)))
      .orderBy(asc(merchants.name), asc(affiliateLinks.slug)),
  ]);

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    summary: p.summary,
    description: p.description,
    brand: p.brandName && p.brandSlug ? { name: p.brandName, slug: p.brandSlug } : null,
    primaryCategoryId: primary[0]?.categoryId ?? null,
    variants,
    images,
    attributes,
    tags: tags.map((t) => t.tag),
    links,
  };
}

/** The brand id behind a product page (cards only carry the slug). */
export async function selectProductBrandId(productId: string): Promise<string | null> {
  const [row] = await db().select({ brandId: products.brandId }).from(products).where(eq(products.id, productId)).limit(1);
  return row?.brandId ?? null;
}

/* ------------------------- build-time and sitemap reads ------------------------- */

/** Featured first, then newest: the pages worth building ahead of time. */
export async function selectTopProductSlugs(limit: number): Promise<string[]> {
  const rows = await db().select({ slug: products.slug }).from(products).where(visibleProductCondition()).orderBy(desc(products.isFeatured), desc(products.createdAt)).limit(limit);
  return rows.map((r) => r.slug);
}

export async function selectSitemapProducts(limit: number): Promise<{ slug: string; updatedAt: Date }[]> {
  return db().select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(visibleProductCondition()).orderBy(desc(products.updatedAt)).limit(limit);
}
