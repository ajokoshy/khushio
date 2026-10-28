import type { Metadata } from "next";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadProducts } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Gift ideas", description: "Gift ideas by budget.", alternates: { canonical: "/gifts" } };
const budgets = [500, 1000, 2000];
export default async function Gifts({ searchParams }: { searchParams: Promise<{ under?: string }> }) {
  const cap = budgets.includes(Number((await searchParams).under)) ? Number((await searchParams).under) : 0;
  const list = (await loadProducts()).filter((p) => !cap || p.price <= cap);
  return (<Page><PageHead title="Gift ideas" intro="Pick a budget to narrow things down." />
    <nav aria-label="Budget" className="mb-6 flex flex-wrap gap-2 text-sm">
      <a href="/gifts" className={`rounded-full border px-4 py-1.5 ${!cap ? "bg-forest text-ivory" : "border-sand bg-white"}`}>All</a>
      {budgets.map((b) => <a key={b} href={`/gifts?under=${b}`} className={`rounded-full border px-4 py-1.5 ${cap === b ? "bg-forest text-ivory" : "border-sand bg-white"}`}>Under ₹{b}</a>)}</nav>
    {list.length ? <Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid> : <p>Nothing in this budget yet.</p>}</Page>);
}
