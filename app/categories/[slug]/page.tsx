import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { categories } from "@/lib/config/site";
import { products } from "@/lib/data/catalog";
type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = () => categories.map((c) => ({ slug: c.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> { const { slug } = await params;
  const c = categories.find((x) => x.slug === slug); return c ? { title: c.label, alternates: { canonical: `/categories/${c.slug}` } } : {};
}
export default async function Category({ params }: P) { const { slug } = await params;
  const c = categories.find((x) => x.slug === slug); if (!c) notFound();
  const list = products.filter((p) => p.category === c.slug);
  return (<Page><PageHead title={c.label} />{list.length ? <Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid> : <p>Products for this category are coming soon.</p>}</Page>);
}
