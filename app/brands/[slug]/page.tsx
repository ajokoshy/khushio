import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { brands, products } from "@/lib/data/catalog";
type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = () => brands.map((b) => ({ slug: b.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> { const { slug } = await params; const b = brands.find((x) => x.slug === slug); return b ? { title: b.name, description: b.about, alternates: { canonical: `/brands/${b.slug}` } } : {}; }
export default async function Brand({ params }: P) { const { slug } = await params;
  const b = brands.find((x) => x.slug === slug); if (!b) notFound();
  return (<Page><PageHead title={b.name} intro={b.about} /><Grid>{products.filter((p) => p.brand === b.slug).map((p) => <ProductCard key={p.slug} p={p} />)}</Grid></Page>);
}
