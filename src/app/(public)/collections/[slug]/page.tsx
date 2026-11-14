import { notFound } from "next/navigation";
import { getCollectionPage } from "@/modules/catalog/service";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ProductGrid } from "@/shared/catalog/product-card";

export const revalidate = 1800; // 30 minutes (core/config/cache.ts); product writes clear it sooner through the `products` tag

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const data = await getCollectionPage((await params).slug);
  if (!data) return { title: "Collection not found", robots: { index: false } };
  return { title: data.collection.name, description: data.collection.description ?? `A curated collection on Khushio: ${data.collection.name}.` };
}

export default async function CollectionPage({ params }: Props) {
  const data = await getCollectionPage((await params).slug);
  if (!data) notFound();
  const { collection, cards } = data;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Discover", href: "/discover" }, { label: collection.name }]} />
      <h1 className="mt-4 text-3xl">{collection.name}</h1>
      {collection.description && <p className="mt-2 max-w-prose text-ink-600">{collection.description}</p>}
      <div className="mt-6">{cards.length === 0 ? <p className="text-ink-600">No products in this collection yet.</p> : <ProductGrid cards={cards} />}</div>
    </section>
  );
}
