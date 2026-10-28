import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/ProductCard";
import { articles } from "@/lib/data/catalog";
type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = () => articles.map((a) => ({ slug: a.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> { const { slug } = await params; const a = articles.find((x) => x.slug === slug); return a ? { title: a.title, description: a.excerpt, alternates: { canonical: `/journal/${a.slug}` } } : {}; }
export default async function Article({ params }: P) { const { slug } = await params;
  const a = articles.find((x) => x.slug === slug); if (!a) notFound();
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: a.title, datePublished: a.date };
  return (<Page><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /><article className="mx-auto max-w-2xl">
    <h1 className="font-display text-4xl font-semibold text-forest">{a.title}</h1><div className="mt-6 space-y-4 font-display text-lg leading-8">{a.body.map((t, i) => <p key={i}>{t}</p>)}</div></article></Page>);
}
