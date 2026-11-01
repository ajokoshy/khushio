import type { Metadata } from "next";
import { Page, PageHead } from "@/components/ProductCard";
import { loadBrandCounts, loadBrands } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Brands", description: "Every brand on Khushio.", alternates: { canonical: "/brands" } };
export const revalidate = 21600;
export default async function Brands() {
  const [brands, counts] = await Promise.all([loadBrands(), loadBrandCounts()]);
  const groups = new Map<string, typeof brands>(); for (const b of brands) { const k = /^[a-z]/i.test(b.name) ? b.name[0].toUpperCase() : "#"; groups.set(k, [...(groups.get(k) ?? []), b]); }
  const letters = [...groups.keys()].sort();
  return (<Page><PageHead title="Brands" intro="Established names and emerging labels, all in one place." />
    {letters.length > 1 && <nav aria-label="Jump to letter" className="mb-8 flex flex-wrap gap-2 text-sm">{letters.map((l) => <a key={l} href={`#letter-${l}`} className="rounded-full border border-sand bg-white px-3 py-1 hover:border-terracotta">{l}</a>)}</nav>}
    {letters.map((l) => (<section key={l} id={`letter-${l}`} aria-labelledby={`l-${l}`} className="mb-8 scroll-mt-24"><h2 id={`l-${l}`} className="mb-3 font-display text-2xl font-semibold text-forest">{l}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{groups.get(l)!.map((b) => <li key={b.slug} className="rounded-card border border-sand bg-white p-4"><a className="font-medium text-forest underline-offset-2 hover:underline" href={`/brands/${b.slug}`}>{b.name}</a>{counts[b.slug] ? <span className="ml-2 text-xs text-ink/60">{counts[b.slug]} product{counts[b.slug] === 1 ? "" : "s"}</span> : null}{b.about && <p className="mt-1 text-sm text-ink/70">{b.about}</p>}</li>)}</ul></section>))}
    {!brands.length && <p>Brands are coming soon.</p>}</Page>);
}
