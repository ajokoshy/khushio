import Link from "next/link";
import { listBrandOptions, listPublicCategoryOptions, listTopCategories } from "@/modules/discover/service";
import { listCatalog } from "@/modules/catalog/service";
import { parseCatalogParams } from "@/modules/catalog/filters";
import { listingMetadata } from "@/modules/catalog/seo";
import { Listing } from "@/shared/catalog/listing";

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = parseCatalogParams(await searchParams);
  return listingMetadata({
    title: filters.q ? `Search: ${filters.q}` : "Discover products",
    description: "Browse and search products, brands and categories on Khushio.",
    path: "/discover",
    filters,
  });
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = parseCatalogParams(await searchParams);
  const [page, brands, choices, top] = await Promise.all([
    listCatalog({ scope: {}, filters }),
    listBrandOptions(),
    listPublicCategoryOptions(),
    listTopCategories(),
  ]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl">{filters.q ? `Results for “${filters.q}”` : "Discover"}</h1>
      {!filters.q && <p className="mt-2 max-w-prose text-ink-600">Search the catalogue, or browse by category and brand.</p>}

      {!filters.q && top.length > 0 && (
        <nav aria-label="Browse by category" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {top.map((c) => (
              <li key={c.id}>
                <Link href={`/categories/${c.slug}`} className="inline-block rounded-full border border-forest-800 px-4 py-1.5 text-sm hover:bg-forest-100">{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-6">
        <Listing
          basePath="/discover"
          filters={filters}
          page={page}
          brands={brands.map((b) => ({ value: b.slug, label: b.name }))}
          categories={choices.map((c) => ({ value: c.slug, label: c.label }))}
          showSearch
        />
      </div>
    </section>
  );
}
