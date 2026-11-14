import { parsePriceToMinor } from "@/core/validation/money";
import { SORTS, type CatalogFilters, type Sort } from "./types";

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Search text: control characters removed, spaces collapsed, at most 80 characters. Under 2 characters means "no search". */
export function normalizeSearch(input: string | undefined): string | undefined {
  const q = (input ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return q.length >= 2 ? q : undefined;
}

function price(input: string | undefined): number | undefined {
  const parsed = parsePriceToMinor(input, "INR");
  return parsed.ok && parsed.minor !== null ? parsed.minor : undefined;
}

/** Everything in the address bar is untrusted: anything malformed is ignored, never an error. */
export function parseCatalogParams(sp: Params, opts: { defaultSort?: Sort } = {}): CatalogFilters {
  const q = normalizeSearch(first(sp.q));
  const brand = first(sp.brand);
  const category = first(sp.category);
  let minPrice = price(first(sp.min));
  let maxPrice = price(first(sp.max));
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];

  const requested = first(sp.sort);
  let sort: Sort = (SORTS as readonly string[]).includes(requested ?? "") ? (requested as Sort) : (opts.defaultSort ?? "new");
  // Relevance only makes sense with a search; a search defaults to it.
  if (!q && sort === "relevance") sort = "new";
  if (q && !requested) sort = "relevance";

  return {
    q,
    brand: brand && SLUG.test(brand) && brand.length <= 80 ? brand : undefined,
    category: category && SLUG.test(category) && category.length <= 80 ? category : undefined,
    minPrice,
    maxPrice,
    sort,
    cursor: first(sp.cursor)?.slice(0, 400) || undefined,
  };
}

/** True when the page is a filtered, searched or paged view (those get noindex and a canonical to the plain page). */
export function isFilteredView(f: CatalogFilters, opts: { defaultSort?: Sort } = {}): boolean {
  return !!(f.q || f.brand || f.category || f.minPrice !== undefined || f.maxPrice !== undefined || f.cursor || f.sort !== (opts.defaultSort ?? "new"));
}

/** Filters back to address-bar parameters (prices as plain rupees). */
export function filtersToParams(f: CatalogFilters, opts: { defaultSort?: Sort } = {}): Record<string, string | undefined> {
  const rupees = (minor: number | undefined) => (minor === undefined ? undefined : String(minor / 100));
  return {
    q: f.q,
    brand: f.brand,
    category: f.category,
    min: rupees(f.minPrice),
    max: rupees(f.maxPrice),
    sort: f.sort === (opts.defaultSort ?? "new") || (f.q && f.sort === "relevance") ? undefined : f.sort,
  };
}
