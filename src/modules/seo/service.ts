import { revalidateTag, unstable_cache } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import { NotFoundError } from "@/core/errors";
import { listSitemapContent } from "@/modules/content/public";
import { hasAnySeo, type SeoFields } from "@/modules/content/types";
import * as repo from "./repository";
import { planSitemap, SITEMAP_CHUNK, type SitemapCounts, type SitemapEntry, type SitemapKind, type SitemapPlan } from "./sitemap";
import type { AuditType, EntitySummary, OverrideType, SeoEntityType } from "./types";
import type { SeoOverrideInput } from "./validation";

/**
 * Search overrides, the SEO audit and the sitemap data (Release 7A).
 * Public reads are cached under the tag `seo` (and the content tags for the sitemap); every override write clears `seo`.
 */

const cachedOverride = unstable_cache((type: SeoEntityType, id: string) => repo.selectOverride(type, id), ["seo-override"], { revalidate: CACHE_TTL.seo, tags: [CACHE_TAGS.seo] });

/** The editor's search fields for a product, category, brand or store page. A read failure means "no override": the page still renders. */
export async function getSeoOverride(type: SeoEntityType, id: string): Promise<SeoFields | null> {
  try {
    return await cachedOverride(type, id);
  } catch (error) {
    console.error("SEO override unavailable", error);
    return null;
  }
}

/* ---------------------------------- admin ---------------------------------- */

export async function getEntity(type: OverrideType, id: string): Promise<{ entity: EntitySummary; seo: SeoFields | null }> {
  const entity = await repo.selectEntity(type, id);
  if (!entity) throw new NotFoundError("That page does not exist");
  return { entity, seo: await repo.selectOverride(type, id) };
}

export async function saveOverride(type: OverrideType, id: string, input: SeoOverrideInput, actorId: string): Promise<void> {
  const { entity, seo: current } = await getEntity(type, id);
  const next: SeoFields = { title: input.seoTitle, description: input.seoDescription, canonical: input.seoCanonical, ogImage: input.seoOgImage, robots: input.seoRobots };
  const before = current ?? { title: null, description: null, canonical: null, ogImage: null, robots: null };
  const changed = (Object.keys(next) as (keyof SeoFields)[]).filter((k) => next[k] !== before[k]);
  if (changed.length === 0) return;
  await repo.upsertOverride(type, id, next);
  await logAuditBestEffort({ actor: actorId, action: "seo.updated", entityType: type, entityId: id, metadata: { slug: entity.slug, changed, cleared: !hasAnySeo(next) } });
  revalidateTag(CACHE_TAGS.seo);
}

export async function listAudit(type: AuditType, opts: { q?: string; onlyIssues: boolean; limit: number; offset: number }) {
  const rows = await repo.selectAudit(type, { ...opts, limit: opts.limit + 1 });
  return { rows: rows.slice(0, opts.limit), hasNext: rows.length > opts.limit };
}

export const countAuditIssues = () => repo.countAuditIssues();

/* ---------------------------------- sitemap ---------------------------------- */

const STATIC: SitemapEntry[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/discover", changeFrequency: "daily", priority: 0.8 },
  // Only the list page: individual offers have no page of their own, so no ended offer can ever be in the sitemap.
  { path: "/deals", changeFrequency: "daily", priority: 0.6 },
  { path: "/articles", changeFrequency: "daily", priority: 0.6 },
  { path: "/guides", changeFrequency: "daily", priority: 0.6 },
];

async function articleEntries(): Promise<SitemapEntry[]> {
  const content = await listSitemapContent(SITEMAP_CHUNK);
  return [
    ...content.guideTypes.map((t): SitemapEntry => ({ path: `/guides/${t}`, changeFrequency: "weekly", priority: 0.5 })),
    ...content.topics.map((t): SitemapEntry => ({ path: `/articles/category/${t.slug}`, changeFrequency: "weekly", priority: 0.5 })),
    ...content.articles.map((a): SitemapEntry => ({ path: `/articles/${a.slug}`, lastModified: a.updatedAt, changeFrequency: "monthly", priority: 0.6 })),
    ...content.pages.map((p): SitemapEntry => ({ path: `/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly", priority: 0.4 })),
  ].slice(0, SITEMAP_CHUNK);
}

async function loadEntries(kind: SitemapKind, page: number): Promise<SitemapEntry[]> {
  switch (kind) {
    case "static": return STATIC;
    case "categories": return (await repo.selectSitemapCategories()).map((slug) => ({ path: `/categories/${slug}`, changeFrequency: "daily", priority: 0.7 }));
    case "brands": return (await repo.selectSitemapBrands()).map((slug) => ({ path: `/brands/${slug}`, changeFrequency: "weekly", priority: 0.5 }));
    case "stores": return (await repo.selectSitemapStores()).map((slug) => ({ path: `/stores/${slug}`, changeFrequency: "weekly", priority: 0.4 }));
    case "articles": return articleEntries();
    case "products": return (await repo.selectSitemapProducts(SITEMAP_CHUNK, (page - 1) * SITEMAP_CHUNK)).map((p) => ({ path: `/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.6 }));
  }
}

const SITEMAP_TAGS = [CACHE_TAGS.products, CACHE_TAGS.categories, CACHE_TAGS.brands, CACHE_TAGS.merchants, CACHE_TAGS.articles, CACHE_TAGS.seo];
const cachedEntries = unstable_cache(loadEntries, ["sitemap-entries"], { revalidate: 3600, tags: SITEMAP_TAGS });

/** One file's URLs. A failure of one kind gives an empty list for it, so a database problem never breaks the rest. */
export async function getSitemapEntries(kind: SitemapKind, page = 1): Promise<SitemapEntry[]> {
  try {
    return await cachedEntries(kind, page);
  } catch (error) {
    console.error(`Sitemap: ${kind} unavailable`, error);
    return kind === "static" ? STATIC : [];
  }
}

const cachedProductCount = unstable_cache(() => repo.countSitemapProducts(), ["sitemap-product-count"], { revalidate: 3600, tags: SITEMAP_TAGS });

export async function getSitemapCounts(): Promise<SitemapCounts> {
  const safe = async (work: () => Promise<number>) => {
    try { return await work(); } catch (error) { console.error("Sitemap count failed", error); return 0; }
  };
  const [categories, brands, stores, articles, products] = await Promise.all([
    safe(async () => (await getSitemapEntries("categories")).length),
    safe(async () => (await getSitemapEntries("brands")).length),
    safe(async () => (await getSitemapEntries("stores")).length),
    safe(async () => (await getSitemapEntries("articles")).length),
    safe(() => cachedProductCount()),
  ]);
  return { static: STATIC.length, categories, brands, stores, articles, products };
}

export async function getSitemapPlan(): Promise<{ plan: SitemapPlan; counts: SitemapCounts }> {
  const counts = await getSitemapCounts();
  return { plan: planSitemap(counts), counts };
}

/** Every URL, for the single-file case (at most SITEMAP_CHUNK in total). */
export async function getAllSitemapEntries(counts: SitemapCounts): Promise<SitemapEntry[]> {
  const parts = await Promise.all((["static", "categories", "brands", "stores", "articles"] as const).map((k) => getSitemapEntries(k)));
  const products = counts.products > 0 ? await getSitemapEntries("products", 1) : [];
  return [...parts.flat(), ...products];
}
