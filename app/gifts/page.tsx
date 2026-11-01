import type { Metadata } from "next";
import { Pagination } from "@/components/Listing";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { searchProducts } from "@/lib/data/catalog";
import { loadOccasions } from "@/lib/data/occasions";
export const metadata: Metadata = { title: "Gift ideas", description: "Gift ideas by budget.", alternates: { canonical: "/gifts" } };
const budgets = [500, 1000, 2000];
export default async function Gifts({ searchParams }: { searchParams: Promise<{ under?: string; page?: string }> }) {
  const sp = await searchParams, cap = budgets.includes(Number(sp.under)) ? Number(sp.under) : 0;
  const [occasions, r] = await Promise.all([loadOccasions(), searchProducts({ max: cap || undefined, page: sp.page, sort: "price-asc", pageSize: 12 })]);
  return (<Page><PageHead title="Gift ideas" intro="Pick a budget to narrow things down." />
    {occasions.length > 0 && <nav aria-label="Occasions" className="mb-4 flex flex-wrap gap-2 text-sm">{occasions.map((o) => <a key={o.slug} href={`/gifts/${o.slug}`} className="rounded-full border border-sand bg-white px-4 py-1.5 hover:border-terracotta">{o.title}</a>)}</nav>}
    <nav aria-label="Budget" className="mb-6 flex flex-wrap gap-2 text-sm">
      <a href="/gifts" className={`rounded-full border px-4 py-1.5 ${!cap ? "bg-forest text-ivory" : "border-sand bg-white"}`}>All</a>
      {budgets.map((b) => <a key={b} href={`/gifts?under=${b}`} className={`rounded-full border px-4 py-1.5 ${cap === b ? "bg-forest text-ivory" : "border-sand bg-white"}`}>Under ₹{b}</a>)}</nav>
    {r.items.length ? <><Grid>{r.items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid><Pagination path="/gifts" params={{ under: cap || undefined }} page={r.page} pages={r.pages} /></> : <p>Nothing in this budget yet.</p>}</Page>);
}
