import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHead } from "@/components/ProductCard";
import { loadArticles } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Journal", description: "Buying guides and ideas from Khushio.", alternates: { canonical: "/journal" } };
export default async function Journal() { const articles = await loadArticles();
  return (<Page><PageHead title="Journal" /><ul className="grid gap-5 md:grid-cols-2">{articles.map((a) => (<li key={a.slug} className="rounded-card border border-sand bg-white p-6">
    <h2 className="font-display text-2xl font-semibold text-forest"><Link href={`/journal/${a.slug}`}>{a.title}</Link></h2><p className="mt-2 text-ink/75">{a.excerpt}</p></li>))}</ul></Page>);
}

export const revalidate = 60;
