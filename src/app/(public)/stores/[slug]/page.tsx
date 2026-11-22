import { notFound } from "next/navigation";
import { listBrandOptions, listPublicCategoryOptions } from "@/modules/discover/service";
import { getPublicMerchant } from "@/modules/merchants/service";
import { getDealsForMerchant } from "@/modules/deals/public";
import { DealGrid } from "@/shared/deals/deal-list";
import { listCatalog } from "@/modules/catalog/service";
import { isFilteredView, parseCatalogParams } from "@/modules/catalog/filters";
import { buildMetadata, notFoundMetadata } from "@/modules/seo/metadata";
import { getSeoOverride } from "@/modules/seo/service";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { Listing } from "@/shared/catalog/listing";

type SP = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params, searchParams }: Props) {
  const store = await getPublicMerchant((await params).slug);
  if (!store) return notFoundMetadata("Store");
  const filters = parseCatalogParams(await searchParams);
  const filtered = isFilteredView(filters);
  // Thin: no products and no live offers to show.
  const thin = !filtered && (await listCatalog({ scope: { merchantId: store.id }, filters })).cards.length === 0 && (await getDealsForMerchant(store.id)).length === 0;
  return buildMetadata({ title: `Products at ${store.name}`, description: `Products you can buy at ${store.name}, found on Khushio.`, path: `/stores/${store.slug}`, noindex: filtered || thin, override: await getSeoOverride("store", store.id) });
}

export default async function StorePage({ params, searchParams }: Props) {
  const store = await getPublicMerchant((await params).slug);
  if (!store) notFound();
  const filters = parseCatalogParams(await searchParams);
  const [page, brands, categories, deals] = await Promise.all([listCatalog({ scope: { merchantId: store.id }, filters }), listBrandOptions(), listPublicCategoryOptions(), getDealsForMerchant(store.id)]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Discover", href: "/discover" }, { label: store.name }]} />
      <h1 className="mt-4 text-3xl">{store.name}</h1>
      <p className="mt-2 max-w-prose text-ink-600">Products you can buy at {store.name}.</p>
      {deals.length > 0 && (
        <section aria-labelledby="deals-heading" className="mt-6">
          <h2 id="deals-heading" className="text-xl">Current offers at {store.name}</h2>
          <div className="mt-3"><DealGrid deals={deals} showStore={false} /></div>
        </section>
      )}
      <div className="mt-6">
        <Listing basePath={`/stores/${store.slug}`} filters={filters} page={page} brands={brands.map((b) => ({ value: b.slug, label: b.name }))} categories={categories.map((c) => ({ value: c.slug, label: c.label }))} emptyHint="Products sold by this store will appear here." />
      </div>
    </section>
  );
}
