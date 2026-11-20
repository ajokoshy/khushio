import { unstable_cache } from "next/cache";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import * as discover from "@/modules/discover/service";
import { decodeCursor } from "./cursor";
import * as repo from "./repository";
import type { CatalogCard, CatalogFilters, CatalogPage, CollectionTile, EmbedProduct, ProductDetailPublic, TrendingMode } from "./types";

/**
 * The public catalogue. Every function returns only products a visitor may see (see core/catalog/visibility.ts).
 * Results are cached for 30 minutes under the tag `products`, which every product write clears, so an edit,
 * publish or archive shows up at once. Searches are not cached (every visitor types something different).
 */

export const PAGE_SIZE = 24;

/** What a listing page is scoped to. Category and brand come as ids/slugs already resolved by the page. */
export type Scope = { categoryIds?: readonly string[]; brandId?: string; merchantId?: string };

type ListArgs = { scope: Scope; filters: CatalogFilters };

async function resolve(args: ListArgs): Promise<repo.ListQuery | null> {
  const { scope, filters } = args;
  let brandId = scope.brandId;
  if (!brandId && filters.brand) {
    brandId = (await discover.listBrandOptions()).find((b) => b.slug === filters.brand)?.id;
    if (!brandId) return null; // an unknown brand in the address matches nothing
  }
  let categoryIds = scope.categoryIds;
  if (!categoryIds && filters.category) {
    const found = await discover.getPublicCategory(filters.category);
    if (!found) return null;
    categoryIds = found.scopeIds;
  }
  const cursor = decodeCursor(filters.cursor);
  return {
    q: filters.q,
    mode: cursor?.s === "rank" ? cursor.m : "fts",
    brandId,
    categoryIds,
    merchantId: scope.merchantId,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sort: filters.sort,
    cursor,
    limit: PAGE_SIZE,
  };
}

const EMPTY: CatalogPage = { cards: [], nextCursor: null, fuzzy: false };

async function runList(args: ListArgs): Promise<CatalogPage> {
  const query = await resolve(args);
  if (!query) return EMPTY;
  const page = await repo.selectCards(query);
  // Nothing matched the words: on the first page, fall back to close matches (typos such as "runing shoes").
  if (query.q && page.cards.length === 0 && !query.cursor) {
    const fuzzy = await repo.selectCards({ ...query, mode: "fuzzy" });
    return { ...fuzzy, fuzzy: fuzzy.cards.length > 0 };
  }
  return { ...page, fuzzy: query.mode === "fuzzy" };
}

const cachedList = unstable_cache(runList, ["catalog-list"], { revalidate: CACHE_TTL.products, tags: [CACHE_TAGS.products] });

export async function listCatalog(args: ListArgs): Promise<CatalogPage> {
  return args.filters.q ? runList(args) : cachedList(args);
}

const cachedProduct = unstable_cache((slug: string) => repo.selectProductPage(slug), ["catalog-product"], { revalidate: CACHE_TTL.products, tags: [CACHE_TAGS.products] });

/** The product page's data, or null (a 404) for an unknown, draft, archived or not-yet-live product. */
export async function getProductPage(slug: string): Promise<ProductDetailPublic | null> {
  return cachedProduct(slug);
}

const cachedRelated = unstable_cache(
  (productId: string, categoryId: string | null, brandId: string | null) => repo.selectRelatedCards(productId, categoryId, brandId, 8),
  ["catalog-related"],
  { revalidate: CACHE_TTL.products, tags: [CACHE_TAGS.products] },
);

export async function getRelatedProducts(product: ProductDetailPublic): Promise<CatalogCard[]> {
  const brandId = product.brand ? (await discover.listBrandOptions()).find((b) => b.slug === product.brand?.slug)?.id ?? null : null;
  return cachedRelated(product.id, product.primaryCategoryId, brandId);
}

const cachedCollection = unstable_cache(
  async (slug: string) => {
    const collection = await repo.selectCollectionBySlug(slug);
    return collection ? { collection, cards: await repo.selectCollectionCards(collection.id, 60) } : null;
  },
  ["catalog-collection"],
  { revalidate: CACHE_TTL.products, tags: [CACHE_TAGS.products] },
);

export async function getCollectionPage(slug: string) {
  return cachedCollection(slug);
}

const cachedEmbeds = unstable_cache((ids: string[]) => repo.selectEmbedProducts(ids), ["catalog-embeds"], { revalidate: CACHE_TTL.products, tags: [CACHE_TAGS.products] });

/** At most this many embedded products are looked up for one page (the editor allows 20; this is the safety stop). */
const MAX_EMBED_LOOKUP = 40;

/**
 * Live data for the products embedded in an article (Release 6B), by id. One cached query for the whole list, cleared by every
 * product write (tag `products`), so a price change, an archive or a new store link shows at once. A product a visitor may not
 * see (draft, archived, not yet live) is not in the map: the page leaves that embed out.
 */
export async function getEmbedProducts(ids: readonly string[]): Promise<Map<string, EmbedProduct>> {
  const unique = [...new Set(ids)].sort().slice(0, MAX_EMBED_LOOKUP);
  if (unique.length === 0) return new Map();
  return new Map((await cachedEmbeds(unique)).map((p) => [p.id, p]));
}

const cachedTrending = unstable_cache((mode: TrendingMode, limit: number) => repo.selectTrendingCards(mode, limit), ["catalog-trending"], { revalidate: CACHE_TTL.products, tags: [CACHE_TAGS.products] });
const cachedTiles = unstable_cache((ids: string[]) => repo.selectCollectionTiles(ids), ["catalog-collection-tiles"], { revalidate: CACHE_TTL.products, tags: [CACHE_TAGS.products] });

/** The homepage "trending products" section (Release 6B). Cached 30 minutes under the tag `products`; one query when rebuilt. */
export async function getTrendingProducts(mode: TrendingMode, limit: number): Promise<CatalogCard[]> {
  return cachedTrending(mode, limit);
}

/** The homepage "collections" section: the chosen collections that are still active, in the chosen order. */
export async function getCollectionTiles(ids: readonly string[]): Promise<CollectionTile[]> {
  return ids.length === 0 ? [] : cachedTiles([...ids]);
}

/** Active collections for the homepage section form. Not cached: only the admin reads it. */
export const listCollectionOptions = () => repo.selectCollectionOptions();

/** Featured and newest product slugs, to build ahead of time. Never throws: a build without a database just builds none. */
export async function listTopProductSlugs(limit = 50): Promise<string[]> {
  try {
    return await repo.selectTopProductSlugs(limit);
  } catch {
    return [];
  }
}

export async function listSitemapProducts(limit = 5000) {
  return repo.selectSitemapProducts(limit);
}
