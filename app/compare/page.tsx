import type { Metadata } from "next";
import { Page, PageHead } from "@/components/ProductCard";
import { catLabel, inr, loadProducts } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Compare products", description: "Compare up to three products side by side.", alternates: { canonical: "/compare" } };
export default async function Compare({ searchParams }: { searchParams: Promise<{ p?: string | string[] }> }) {
  const raw = (await searchParams).p; const picked = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 3);
  const all = await loadProducts(); const sel = picked.map((s) => all.find((p) => p.slug === s)).filter((p): p is NonNullable<typeof p> => !!p);
  const rows: [string, (p: (typeof all)[number]) => string][] = [["Price", (p) => inr(p.price)], ["MRP", (p) => (p.mrp ? inr(p.mrp) : "-")], ["Category", (p) => catLabel(p.category)], ["Brand", (p) => p.brand || "-"], ["About", (p) => p.blurb]];
  return (<Page><PageHead title="Compare products" intro="Choose up to three products." />
    <form className="mb-8 rounded-card border border-sand bg-white p-5"><fieldset><legend className="mb-3 font-medium text-forest">Products</legend>
      <div className="grid gap-2 sm:grid-cols-2">{all.map((p) => <label key={p.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" name="p" value={p.slug} defaultChecked={picked.includes(p.slug)} />{p.name}</label>)}</div></fieldset>
      <button className="mt-4 rounded-full bg-forest px-6 py-2 text-sm font-medium text-ivory">Compare</button></form>
    {sel.length > 1 && <div className="overflow-x-auto"><table className="w-full min-w-[32rem] border-collapse text-left text-sm">
      <thead><tr><th className="p-3" />{sel.map((p) => <th key={p.slug} className="p-3 font-display text-lg text-forest"><a href={`/products/${p.slug}`}>{p.name}</a></th>)}</tr></thead>
      <tbody>{rows.map(([l, f]) => <tr key={l} className="border-t border-sand"><th scope="row" className="p-3 font-medium">{l}</th>{sel.map((p) => <td key={p.slug} className="p-3">{f(p)}</td>)}</tr>)}</tbody></table></div>}</Page>);
}
