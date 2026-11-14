import Link from "next/link";
import { filtersToParams } from "@/modules/catalog/filters";
import type { CatalogFilters, CatalogPage } from "@/modules/catalog/types";
import { CursorPager } from "./cursor-pager";
import { FilterBar } from "./filter-bar";
import { ProductGrid } from "./product-card";

type Option = { value: string; label: string };

type Props = {
  basePath: string;
  filters: CatalogFilters;
  page: CatalogPage;
  brands: Option[];
  categories?: Option[];
  showSearch?: boolean;
  hideBrand?: boolean;
  emptyHint?: string;
};

/** Filter bar, result line, grid and pager: the shared body of every listing page. */
export function Listing({ basePath, filters, page, brands, categories, showSearch, hideBrand, emptyHint }: Props) {
  const params = filtersToParams(filters);
  const refined = !!(filters.q || filters.brand || filters.category || filters.minPrice !== undefined || filters.maxPrice !== undefined);
  return (
    <>
      <FilterBar action={basePath} filters={filters} brands={brands} categories={categories} showSearch={showSearch} hideBrand={hideBrand} />
      <div className="mt-6" aria-live="polite">
        {filters.q && page.fuzzy && page.cards.length > 0 && <p className="mb-3 text-sm text-ink-600">No exact match for &ldquo;{filters.q}&rdquo;. Showing close matches.</p>}
        {page.cards.length === 0 ? (
          <div className="rounded-card border border-cream-200 bg-cream-50 p-8 text-center">
            <p className="text-lg font-medium">{filters.q ? `No products found for “${filters.q}”` : "No products here yet"}</p>
            <p className="mt-2 text-sm text-ink-600">{refined ? "Try different words, remove a filter or widen the price range." : (emptyHint ?? "Check back soon.")}</p>
            {refined && <Link href={basePath} className="mt-4 inline-block text-sm font-medium text-coral-600 underline">Clear all filters</Link>}
          </div>
        ) : (
          <ProductGrid cards={page.cards} />
        )}
      </div>
      <CursorPager basePath={basePath} params={params} nextCursor={page.nextCursor} isFirstPage={!filters.cursor} />
    </>
  );
}
