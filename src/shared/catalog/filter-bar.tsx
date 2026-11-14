import Link from "next/link";
import type { CatalogFilters } from "@/modules/catalog/types";

type Option = { value: string; label: string };

type Props = {
  /** The page the form submits to (it is a plain GET form: it works without JavaScript and every result is a shareable link). */
  action: string;
  filters: CatalogFilters;
  brands: Option[];
  /** Offer a category filter (the discover page). Category pages are already scoped to one category. */
  categories?: Option[];
  showSearch?: boolean;
  hideBrand?: boolean;
};

const field = "w-full rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm";

export function FilterBar({ action, filters, brands, categories, showSearch = false, hideBrand = false }: Props) {
  const rupees = (minor?: number) => (minor === undefined ? "" : String(minor / 100));
  return (
    <form action={action} method="get" role="search" aria-label="Search and filter products" className="rounded-card border border-cream-200 bg-cream-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {showSearch && (
          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor="f-q" className="text-sm font-medium">Search</label>
            <input id="f-q" name="q" type="search" defaultValue={filters.q ?? ""} maxLength={80} placeholder="Product, brand or tag" className={`${field} mt-1`} />
          </div>
        )}
        {categories && (
          <div>
            <label htmlFor="f-category" className="text-sm font-medium">Category</label>
            <select id="f-category" name="category" defaultValue={filters.category ?? ""} className={`${field} mt-1`}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        )}
        {!hideBrand && (
          <div>
            <label htmlFor="f-brand" className="text-sm font-medium">Brand</label>
            <select id="f-brand" name="brand" defaultValue={filters.brand ?? ""} className={`${field} mt-1`}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-min" className="text-sm font-medium">Min price (₹)</label>
          <input id="f-min" name="min" inputMode="decimal" defaultValue={rupees(filters.minPrice)} className={`${field} mt-1`} />
        </div>
        <div>
          <label htmlFor="f-max" className="text-sm font-medium">Max price (₹)</label>
          <input id="f-max" name="max" inputMode="decimal" defaultValue={rupees(filters.maxPrice)} className={`${field} mt-1`} />
        </div>
        <div>
          <label htmlFor="f-sort" className="text-sm font-medium">Sort by</label>
          <select id="f-sort" name="sort" defaultValue={filters.sort} className={`${field} mt-1`}>
            {filters.q && <option value="relevance">Best match</option>}
            <option value="new">Newest</option>
            <option value="name">Name A to Z</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button type="submit" className="rounded-xl bg-forest-800 px-5 py-2 text-sm font-medium text-cream-50 hover:bg-forest-700">Apply</button>
        <Link href={action} className="text-sm text-ink-600 underline">Reset</Link>
      </div>
    </form>
  );
}
