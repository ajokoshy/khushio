import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadCollections, loadProductsBySlugs } from "@/lib/data/catalog";
import { followRedirect } from "@/lib/redirects-db";
type P = { params: Promise<{ slug: string }> };
export const revalidate = 21600; // edits refresh pages at once through cache tags; this only bounds staleness
export const generateStaticParams = async () => (await loadCollections()).map((c) => ({ slug: c.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params; const c = (await loadCollections()).find((x) => x.slug === slug);
  return c ? { title: c.title, description: c.description || undefined, alternates: { canonical: `/collections/${c.slug}` } } : {};
}
export default async function CollectionPage({ params }: P) {
  const { slug } = await params; const c = (await loadCollections()).find((x) => x.slug === slug);
  if (!c) { await followRedirect(`/collections/${slug}`); notFound(); }
  const list = await loadProductsBySlugs(c.productSlugs);
  return (<Page><Breadcrumbs items={[{ name: "Collections", href: "/collections" }, { name: c.title, href: `/collections/${c.slug}` }]} /><PageHead title={c.title} intro={c.description} />{list.length ? <Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid> : <p>No products in this collection yet.</p>}</Page>);
}
