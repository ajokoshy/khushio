import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadCategories, loadProducts } from "@/lib/data/catalog";
type P = { params: Promise<{ slug: string }> };
export const revalidate = 60;
export const generateStaticParams = async () => (await loadCategories()).map((c) => ({ slug: c.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params; const c = (await loadCategories()).find((x) => x.slug === slug);
  return c ? { title: c.label, alternates: { canonical: `/categories/${c.slug}` } } : {};
}
export default async function Category({ params }: P) {
  const { slug } = await params; const c = (await loadCategories()).find((x) => x.slug === slug); if (!c) notFound();
  const list = (await loadProducts()).filter((p) => p.category === c.slug);
  return (<Page><Breadcrumbs items={[{ name: c.label, href: `/categories/${c.slug}` }]} /><PageHead title={c.label} />{list.length ? <Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid> : <p>Products for this category are coming soon.</p>}</Page>);
}
