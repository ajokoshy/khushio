import type { Metadata } from "next";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadCategories, loadProducts } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Best picks", description: "The best-value pick in every Khushio category.", alternates: { canonical: "/best-picks" } };
export const revalidate = 60;
const off = (p: { price: number; mrp?: number }) => (p.mrp ? (p.mrp - p.price) / p.mrp : 0);
export default async function BestPicks() {
  const all = await loadProducts();
  const categories = await loadCategories();
  return (<Page><PageHead title="Best picks" intro="One standout in each category, chosen by the biggest saving against the listed MRP." />
    {categories.map((c) => { const top = all.filter((p) => p.category === c.slug).sort((a, b) => off(b) - off(a))[0];
      return top ? (<section key={c.slug} className="mb-10"><h2 className="mb-3 font-display text-2xl font-semibold text-forest">{c.label}</h2><Grid><ProductCard p={top} /></Grid></section>) : null; })}</Page>);
}
