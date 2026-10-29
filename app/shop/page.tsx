import type { Metadata } from "next";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadCategories, loadProducts } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Shop", description: "Browse all products on Khushio.", alternates: { canonical: "/shop" } };
const I = "rounded-lg border border-sand bg-white px-3 py-2 text-sm";
export default async function Shop({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; sort?: string }> }) {
  const sp = await searchParams, q = sp.q?.trim().toLowerCase();
  const categories = await loadCategories();
  let list = await loadProducts();
  if (q) list = list.filter((p) => `${p.name} ${p.blurb} ${p.brand}`.toLowerCase().includes(q));
  if (sp.cat) list = list.filter((p) => p.category === sp.cat);
  if (sp.sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
  if (sp.sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
  return (<Page><PageHead title={q ? `Results for “${q}”` : "Shop"} />
    <form role="search" className="mb-8 flex flex-wrap gap-3">
      <input name="q" type="search" defaultValue={sp.q} placeholder="Search" aria-label="Search" className={I} />
      <select name="cat" defaultValue={sp.cat ?? ""} aria-label="Category" className={I}><option value="">All categories</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select>
      <select name="sort" defaultValue={sp.sort ?? ""} aria-label="Sort" className={I}><option value="">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select>
      <button className="rounded-full bg-forest px-5 py-2 text-sm font-medium text-ivory">Apply</button></form>
    {list.length ? <Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid> : <p>No products match yet. Try a broader word.</p>}</Page>);
}
