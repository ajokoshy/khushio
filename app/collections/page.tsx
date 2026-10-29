import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHead } from "@/components/ProductCard";
import { loadCollections } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Collections", description: "Hand-picked collections from Khushio.", alternates: { canonical: "/collections" } };
export const revalidate = 60;
export default async function Collections() {
  const list = await loadCollections();
  return (<Page><PageHead title="Collections" />{list.length ? <ul className="grid gap-5 md:grid-cols-2">{list.map((c) => (<li key={c.slug} className="rounded-card border border-sand bg-white p-6"><h2 className="font-display text-2xl font-semibold text-forest"><Link href={`/collections/${c.slug}`}>{c.title}</Link></h2><p className="mt-2 text-ink/75">{c.description}</p><p className="mt-2 text-xs text-ink/50">{c.productSlugs.length} products</p></li>))}</ul> : <p>Collections are coming soon.</p>}</Page>);
}
