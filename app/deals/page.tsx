import type { Metadata } from "next";
import { Page, PageHead } from "@/components/ProductCard";
import { AFFILIATE_REL } from "@/lib/affiliate/rules";
import { loadDeals } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Deals", description: "Current deals from partner stores.", alternates: { canonical: "/deals" } };
// Deals expire by date, so this page refreshes every 30 minutes (and straight away when a deal is edited).
export const revalidate = 1800;
export default async function Deals() {
  const deals = await loadDeals();
  return (<Page><PageHead title="Deals" intro="Offers from partner stores. Terms, prices and end dates are set by the retailer and can change at any time." />
    {deals.length ? <ul className="grid gap-4 md:grid-cols-2">{deals.map((d) => (<li key={d.slug} className="flex items-center justify-between gap-4 rounded-card border border-sand bg-white p-5">
      <div><h2 className="font-display text-xl font-semibold text-forest"><a href={`/deals/${d.slug}`}>{d.title}</a></h2><p className="text-sm text-ink/60">{d.merchant}{d.ends ? ` · ends ${d.ends}` : ""}</p></div>
      <a href={`/go/${d.offerId}`} rel={AFFILIATE_REL} target="_blank" className="shrink-0 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-white">Get deal</a></li>))}</ul> : <p>No live deals right now. Check back soon.</p>}</Page>);
}
