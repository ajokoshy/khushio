import { normalizeSearch } from "@/lib/search-core";

/**
 * Canonical and robots rules for paginated, filterable listings:
 * - the canonical never carries filters; page N>1 keeps only ?page=N
 * - any search, price range or sort variant is noindex (it duplicates the base listing) but links are still followed
 */
export function listingSeo(path: string, raw: Record<string, string | string[] | undefined>, opts: { catIsFilter?: boolean } = {}) {
  const f = normalizeSearch(raw as Parameters<typeof normalizeSearch>[0]);
  const filtered = !!(f.q || f.min || f.max || raw.sort || f.brand || f.merchant || (opts.catIsFilter && f.categories));
  return { canonical: !filtered && f.page > 1 ? `${path}?page=${f.page}` : path, noindex: filtered, page: f.page, q: f.q };
}
