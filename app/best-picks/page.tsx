import type { Metadata } from "next";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadCategories, searchProducts } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Best picks", description: "The best-value pick in every Khushio category.", alternates: { canonical: "/best-picks" } };
export const revalidate = 21600; // edits refresh pages at once through cache tags; this only bounds staleness
export default async function BestPicks() {
  const categories = (await loadCategories()).filter((c) => !c.parentId);
  const tops = await Promise.all(categories.map(async (c) => (await searchProducts({ categories: [c.slug], sort: "saving", pageSize: 1 })).items[0]));
  return (<Page><PageHead title="Best picks" intro="One standout in each category, chosen by the biggest saving against the listed MRP." />
    {categories.map((c, i) => { const top = tops[i];
      return top ? (<section key={c.slug} className="mb-10"><h2 className="mb-3 font-display text-2xl font-semibold text-forest">{c.label}</h2><Grid><ProductCard p={top} /></Grid></section>) : null; })}</Page>);
}
