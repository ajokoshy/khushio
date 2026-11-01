/** Pure search helpers: query parsing, pagination maths and the in-memory search used for local development. */
export const PAGE_SIZE = 12;
export const SORTS = ["featured", "newest", "price-asc", "price-desc", "relevance", "saving"] as const;
export type Sort = (typeof SORTS)[number];

export type SearchParams = {
  q?: string; categories?: string[]; brand?: string; merchant?: string; min?: number; max?: number; sort?: Sort; page?: number; pageSize?: number;
};

/** Turns free text into a safe prefix tsquery ("jute bas" -> "jute:* & bas:*"). Only letters and digits survive, so no tsquery syntax can be injected. */
export function toTsQuery(q: string | undefined | null): string | null {
  const terms = (q ?? "").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 8);
  return terms?.length ? terms.map((t) => `${t.slice(0, 40)}:*`).join(" & ") : null;
}

const num = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : undefined; };
/** Cleans untrusted URL params into a bounded, cache-friendly search request. */
export function normalizeSearch(raw: { q?: string; cat?: string | string[]; categories?: string[]; brand?: string; merchant?: string; min?: unknown; max?: unknown; sort?: string; page?: unknown; pageSize?: number }): Required<Pick<SearchParams, "page" | "pageSize" | "sort">> & SearchParams {
  const q = (raw.q ?? "").trim().replace(/\s+/g, " ").slice(0, 80).toLowerCase() || undefined;
  const cats = raw.categories ?? (raw.cat ? [raw.cat].flat() : []);
  const sort = (SORTS as readonly string[]).includes(raw.sort ?? "") ? (raw.sort as Sort) : q ? "relevance" : "featured";
  const min = num(raw.min), max = num(raw.max);
  return {
    q, categories: cats.length ? cats.map(String).slice(0, 40) : undefined, brand: raw.brand?.trim().slice(0, 80) || undefined, merchant: raw.merchant?.trim().slice(0, 80) || undefined,
    min, max: min && max && max < min ? undefined : max, sort: sort === "relevance" && !q ? "featured" : sort,
    page: Math.min(Math.max(num(raw.page) ?? 1, 1), 500), pageSize: Math.min(Math.max(raw.pageSize ?? PAGE_SIZE, 1), 48),
  };
}

export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/** Pagination window like [1, "…", 4, 5, 6, "…", 20]. */
export function pageWindow(page: number, pages: number): (number | "…")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | "…")[] = []; let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) { if (n - prev > 1) out.push("…"); out.push(n); prev = n; }
  return out;
}

export type SearchResult<T> = { items: T[]; total: number; page: number; pages: number; pageSize: number };

type Searchable = { slug: string; name: string; brand: string; category: string; blurb: string; price: number; mrp?: number; featured?: boolean; offers: { merchant: string }[] };
/** Same semantics as the SQL search, for development without a database. `descendants` maps a category slug to itself plus its children. */
export function searchInMemory<T extends Searchable>(all: T[], p: ReturnType<typeof normalizeSearch>): SearchResult<T> {
  const terms = (p.q ?? "").match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  let list = all.filter((x) => {
    const hay = `${x.name} ${x.brand.replace(/-/g, " ")} ${x.category.replace(/-/g, " ")} ${x.blurb}`.toLowerCase();
    return terms.every((t) => hay.split(/[^\p{L}\p{M}\p{N}]+/u).some((w) => w.startsWith(t)))
      && (!p.categories || p.categories.includes(x.category)) && (!p.brand || x.brand === p.brand)
      && (!p.merchant || x.offers.some((o) => o.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === p.merchant))
      && (!p.min || x.price >= p.min) && (!p.max || x.price <= p.max);
  });
  const saving = (x: Searchable) => (x.mrp ? (x.mrp - x.price) / x.mrp : 0);
  if (p.sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
  else if (p.sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
  else if (p.sort === "saving") list = [...list].sort((a, b) => saving(b) - saving(a));
  else if (p.sort === "newest") list = [...list].reverse();
  const pages = pageCount(list.length, p.pageSize), page = Math.min(p.page, pages);
  return { items: list.slice((page - 1) * p.pageSize, page * p.pageSize), total: list.length, page, pages, pageSize: p.pageSize };
}

/** Depth-first category list with depth, for indented selects. Categories whose parent is missing are treated as top level. */
export function flattenTree<T extends { id?: string; parentId?: string | null }>(cats: T[]): { cat: T; depth: number }[] {
  const ids = new Set(cats.map((c) => c.id).filter(Boolean)), out: { cat: T; depth: number }[] = [], seen = new Set<T>();
  const walk = (parent: string | null, depth: number) => { for (const c of cats) if (!seen.has(c) && (c.parentId ?? null) === parent && depth < 8) { seen.add(c); out.push({ cat: c, depth }); if (c.id) walk(c.id, depth + 1); } };
  walk(null, 0);
  for (const c of cats) if (!seen.has(c) && !(c.parentId && ids.has(c.parentId))) { seen.add(c); out.push({ cat: c, depth: 0 }); if (c.id) walk(c.id, 1); }
  return out;
}
