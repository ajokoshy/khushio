import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadProducts } from "@/lib/data/catalog";
import { slugify } from "@/lib/slug";
type P = { params: Promise<{ slug: string }> };
export const revalidate = 60;
async function find(slug: string) {
  const list = (await loadProducts()).filter((p) => p.offers.some((o) => slugify(o.merchant) === slug));
  return { list, name: list[0]?.offers.find((o) => slugify(o.merchant) === slug)?.merchant };
}
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params; const { name } = await find(slug);
  return name ? { title: `Shop from ${name}`, alternates: { canonical: `/stores/${slug}` } } : {};
}
export default async function Store({ params }: P) {
  const { slug } = await params; const { list, name } = await find(slug); if (!name) notFound();
  return (<Page><Breadcrumbs items={[{ name, href: `/stores/${slug}` }]} /><PageHead title={`Shop from ${name}`} /><Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid></Page>);
}
