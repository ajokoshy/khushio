import type { Metadata } from "next";
import { Page, PageHead } from "@/components/ProductCard";
import { loadCoupons } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Coupons", description: "Coupon codes from our partner stores.", alternates: { canonical: "/coupons" } };
export default async function Coupons() { const coupons = await loadCoupons();
  return (<Page><PageHead title="Coupons" /><ul className="grid gap-4 md:grid-cols-2">{coupons.map((c) => (<li key={c.code} className="rounded-card border border-dashed border-terracotta bg-white p-5">
    <p className="text-sm text-ink/60">{c.merchant}</p><p className="font-display text-2xl font-semibold text-forest">{c.code}</p><p className="text-sm">{c.detail}</p>
    <a href={`/go/${c.offerId}`} rel="sponsored nofollow noopener" target="_blank" className="mt-3 inline-block text-sm font-medium text-terracotta underline">Shop with this code</a></li>))}</ul></Page>);
}

export const revalidate = 60;
