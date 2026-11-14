import { notFound } from "next/navigation";
import { listBrandOptions, listPublicCategoryOptions } from "@/modules/discover/service";
import { getPublicMerchant } from "@/modules/merchants/service";
import { listCatalog } from "@/modules/catalog/service";
import { parseCatalogParams } from "@/modules/catalog/filters";
import { listingMetadata } from "@/modules/catalog/seo";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { Listing } from "@/shared/catalog/listing";

type SP = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params, searchParams }: Props) {
  const store = await getPublicMerchant((await params).slug);
  if (!store) return { title: "Store not found", robots: { index: false } };
  return listingMetadata({ title: `Products at ${store.name}`, description: `Products you can buy at ${store.name}, found on Khushio.`, path: `/stores/${store.slug}`, filters: parseCatalogParams(await searchParams) });
}

export default async function StorePage({ params, searchParams }: Props) {
  const store = await getPublicMerchant((await params).slug);
  if (!store) notFound();
  const filters = parseCatalogParams(await searchParams);
  const [page, brands, categories] = await Promise.all([listCatalog({ scope: { merchantId: store.id }, filters }), listBrandOptions(), listPublicCategoryOptions()]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Discover", href: "/discover" }, { label: store.name }]} />
      <h1 className="mt-4 text-3xl">{store.name}</h1>
      <p className="mt-2 max-w-prose text-ink-600">Products you can buy at {store.name}.</p>
      <div className="mt-6">
        <Listing basePath={`/stores/${store.slug}`} filters={filters} page={page} brands={brands.map((b) => ({ value: b.slug, label: b.name }))} categories={categories.map((c) => ({ value: c.slug, label: c.label }))} emptyHint="Products sold by this store will appear here." />
      </div>
    </section>
  );
}
