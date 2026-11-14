import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCategory, listBrandOptions } from "@/modules/discover/service";
import { listCatalog } from "@/modules/catalog/service";
import { parseCatalogParams } from "@/modules/catalog/filters";
import { listingMetadata } from "@/modules/catalog/seo";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { Listing } from "@/shared/catalog/listing";

type SP = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params, searchParams }: Props) {
  const found = await getPublicCategory((await params).slug);
  if (!found) return { title: "Category not found", robots: { index: false } };
  return listingMetadata({
    title: found.category.name,
    description: found.category.description ?? `Products in ${found.category.name} on Khushio.`,
    path: `/categories/${found.category.slug}`,
    filters: parseCatalogParams(await searchParams),
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const found = await getPublicCategory((await params).slug);
  if (!found) notFound();
  const filters = parseCatalogParams(await searchParams);
  // On a category page the category is fixed by the address, not by the filter form.
  const [page, brands] = await Promise.all([listCatalog({ scope: { categoryIds: found.scopeIds }, filters: { ...filters, category: undefined } }), listBrandOptions()]);
  const { category, ancestors, children } = found;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Discover", href: "/discover" }, ...ancestors.map((a) => ({ label: a.name, href: `/categories/${a.slug}` })), { label: category.name }]} />
      <h1 className="mt-4 text-3xl">{category.name}</h1>
      {category.description && <p className="mt-2 max-w-prose text-ink-600">{category.description}</p>}

      {children.length > 0 && (
        <nav aria-label={`${category.name} subcategories`} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {children.map((c) => (
              <li key={c.id}><Link href={`/categories/${c.slug}`} className="inline-block rounded-full border border-forest-800 px-4 py-1.5 text-sm hover:bg-forest-100">{c.name}</Link></li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-6">
        <Listing basePath={`/categories/${category.slug}`} filters={filters} page={page} brands={brands.map((b) => ({ value: b.slug, label: b.name }))} emptyHint="Products in this category will appear here." />
      </div>
    </section>
  );
}
