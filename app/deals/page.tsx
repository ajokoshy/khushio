import type { Metadata } from "next";
import { Page, PageHead } from "@/components/ProductCard";
import { deals } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Deals", description: "Current deals on Khushio.", alternates: { canonical: "/deals" } };
export default function Deals() {
  return (<Page><PageHead title="Deals" intro="Offers we have checked. Prices and end dates can change at the retailer." />
    <ul className="grid gap-4 md:grid-cols-2">{deals.map((d) => (<li key={d.slug} className="flex items-center justify-between gap-4 rounded-card border border-sand bg-white p-5">
      <div><h2 className="font-display text-xl font-semibold text-forest">{d.title}</h2><p className="text-sm text-ink/60">{d.merchant} · ends {d.ends}</p></div>
      <a href={`/go/${d.offerId}`} rel="sponsored nofollow noopener" target="_blank" className="shrink-0 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-white">Get deal</a></li>))}</ul></Page>);
}
