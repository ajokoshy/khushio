import type { Metadata } from "next";
import { CategoryStrip } from "@/components/CategoryStrip";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { brands, loadProducts } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Discover", description: "Fresh finds, brands and categories on Khushio.", alternates: { canonical: "/discover" } };
export const revalidate = 60;
export default async function Discover() {
  const fresh = (await loadProducts()).slice(-6).reverse();
  return (<Page><PageHead title="Discover" intro="Fresh finds, emerging brands and every category in one place." />
    <h2 className="mb-3 font-display text-2xl font-semibold text-forest">New and noteworthy</h2><Grid>{fresh.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid>
    <h2 className="mb-3 mt-12 font-display text-2xl font-semibold text-forest">Brands</h2>
    <ul className="flex flex-wrap gap-3">{brands.map((b) => <li key={b.slug}><a href={`/brands/${b.slug}`} className="rounded-full border border-sand bg-white px-4 py-2 text-sm hover:border-terracotta">{b.name}</a></li>)}</ul>
    <h2 className="mb-5 mt-12 font-display text-2xl font-semibold text-forest">Browse by category</h2><CategoryStrip /></Page>);
}
