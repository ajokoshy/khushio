import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadCollections, loadProducts } from "@/lib/data/catalog";
type P = { params: Promise<{ slug: string }> };
export const revalidate = 60;
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params; const c = (await loadCollections()).find((x) => x.slug === slug);
  return c ? { title: c.title, description: c.description || undefined, alternates: { canonical: `/collections/${c.slug}` } } : {};
}
export default async function CollectionPage({ params }: P) {
  const { slug } = await params; const c = (await loadCollections()).find((x) => x.slug === slug); if (!c) notFound();
  const all = await loadProducts(); const list = c.productSlugs.map((s) => all.find((p) => p.slug === s)).filter((p): p is NonNullable<typeof p> => !!p);
  return (<Page><Breadcrumbs items={[{ name: "Collections", href: "/collections" }, { name: c.title, href: `/collections/${c.slug}` }]} /><PageHead title={c.title} intro={c.description} />{list.length ? <Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid> : <p>No products in this collection yet.</p>}</Page>);
}
