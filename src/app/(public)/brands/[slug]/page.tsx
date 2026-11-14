import { notFound } from "next/navigation";
import { getPublicBrand, listPublicCategoryOptions } from "@/modules/discover/service";
import { listCatalog } from "@/modules/catalog/service";
import { parseCatalogParams } from "@/modules/catalog/filters";
import { listingMetadata } from "@/modules/catalog/seo";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { Listing } from "@/shared/catalog/listing";

type SP = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params, searchParams }: Props) {
  const brand = await getPublicBrand((await params).slug);
  if (!brand) return { title: "Brand not found", robots: { index: false } };
  return listingMetadata({
    title: brand.name,
    description: brand.description ?? `Products by ${brand.name} on Khushio.`,
    path: `/brands/${brand.slug}`,
    filters: parseCatalogParams(await searchParams),
  });
}

export default async function BrandPage({ params, searchParams }: Props) {
  const brand = await getPublicBrand((await params).slug);
  if (!brand) notFound();
  const filters = parseCatalogParams(await searchParams);
  const [page, categories] = await Promise.all([listCatalog({ scope: { brandId: brand.id }, filters: { ...filters, brand: undefined } }), listPublicCategoryOptions()]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Discover", href: "/discover" }, { label: brand.name }]} />
      <h1 className="mt-4 text-3xl">{brand.name}</h1>
      {brand.description && <p className="mt-2 max-w-prose text-ink-600">{brand.description}</p>}
      <div className="mt-6">
        <Listing basePath={`/brands/${brand.slug}`} filters={filters} page={page} brands={[]} hideBrand categories={categories.map((c) => ({ value: c.slug, label: c.label }))} emptyHint="Products from this brand will appear here." />
      </div>
    </section>
  );
}
