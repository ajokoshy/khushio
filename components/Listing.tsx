import Link from "next/link";
import { flattenTree, pageWindow, type Sort } from "@/lib/search-core";

/** Builds "?a=1&b=2", leaving out empty values. */
export const qs = (params: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString(); return s ? `?${s}` : "";
};
const I = "rounded-lg border border-sand bg-white px-3 py-2 text-sm";

export function SearchBar({ action, q, cat, sort, min, max, categories, placeholder = "Search" }: {
  action: string; q?: string; cat?: string; sort?: Sort; min?: number; max?: number; placeholder?: string;
  categories?: { id?: string; parentId?: string | null; slug: string; label: string }[];
}) {
  return (
    <form action={action} role="search" className="mb-8 flex flex-wrap items-center gap-3">
      <input name="q" type="search" defaultValue={q} placeholder={placeholder} aria-label="Search" maxLength={80} className={I} />
      {categories && <select name="cat" defaultValue={cat ?? ""} aria-label="Category" className={I}><option value="">All categories</option>
        {flattenTree(categories).map(({ cat: c, depth }) => <option key={c.slug} value={c.slug}>{`${"– ".repeat(depth)}${c.label}`}</option>)}</select>}
      <input name="min" type="number" min={1} inputMode="numeric" defaultValue={min} placeholder="Min ₹" aria-label="Minimum price" className={`${I} w-24`} />
      <input name="max" type="number" min={1} inputMode="numeric" defaultValue={max} placeholder="Max ₹" aria-label="Maximum price" className={`${I} w-24`} />
      <select name="sort" defaultValue={sort ?? ""} aria-label="Sort" className={I}>
        <option value="">{q ? "Most relevant" : "Featured"}</option><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select>
      <button className="rounded-full bg-forest px-5 py-2 text-sm font-medium text-ivory">Apply</button>
    </form>
  );
}

export function Pagination({ path, params, page, pages }: { path: string; params: Record<string, string | number | undefined>; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (n: number) => `${path}${qs({ ...params, page: n > 1 ? n : undefined })}`;
  const item = "min-w-9 rounded-full border border-sand bg-white px-3 py-1.5 text-center text-sm";
  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && <Link rel="prev" className={item} href={href(page - 1)}>Previous</Link>}
      {pageWindow(page, pages).map((n, i) => n === "…" ? <span key={`g${i}`} className="px-1 text-ink/50" aria-hidden>…</span>
        : <Link key={n} href={href(n)} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} className={`${item} ${n === page ? "!border-forest !bg-forest text-ivory" : ""}`}>{n}</Link>)}
      {page < pages && <Link rel="next" className={item} href={href(page + 1)}>Next</Link>}
    </nav>
  );
}
