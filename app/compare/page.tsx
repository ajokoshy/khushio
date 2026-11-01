import type { Metadata } from "next";
import { CompareTable } from "@/components/CompareTable";
import { Page, PageHead } from "@/components/ProductCard";
import { loadProductOptions, loadProductsBySlugs } from "@/lib/data/catalog";
import { loadComparisons } from "@/lib/data/comparisons";
export const metadata: Metadata = { title: "Compare products", description: "Compare up to three products side by side.", alternates: { canonical: "/compare" }, robots: { index: false, follow: true } };
export default async function Compare({ searchParams }: { searchParams: Promise<{ p?: string | string[] }> }) {
  const raw = (await searchParams).p; const picked = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 3);
  const [options, sel, curated] = await Promise.all([loadProductOptions(), loadProductsBySlugs(picked), loadComparisons()]);
  return (<Page><PageHead title="Compare products" intro="Choose up to three products." />
    {curated.length > 0 && <section aria-labelledby="curated" className="mb-10"><h2 id="curated" className="mb-3 font-display text-2xl font-semibold text-forest">Our comparisons</h2><ul className="flex flex-wrap gap-2 text-sm">{curated.map((c) => <li key={c.slug}><a className="rounded-full border border-sand bg-white px-4 py-1.5 hover:border-terracotta" href={`/compare/${c.slug}`}>{c.title}</a></li>)}</ul></section>}
    <form className="mb-8 rounded-card border border-sand bg-white p-5"><fieldset><legend className="mb-3 font-medium text-forest">Products</legend>
      <div className="grid gap-2 sm:grid-cols-2">{options.map((p) => <label key={p.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" name="p" value={p.slug} defaultChecked={picked.includes(p.slug)} />{p.name}</label>)}</div></fieldset>
      <button className="mt-4 rounded-full bg-forest px-6 py-2 text-sm font-medium text-ivory">Compare</button></form>
    {sel.length > 1 && <CompareTable items={sel} />}
</Page>);
}
