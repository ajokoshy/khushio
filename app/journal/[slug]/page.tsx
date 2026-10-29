import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/ProductCard";
import { loadArticles } from "@/lib/data/catalog";
import { site } from "@/lib/config/site";
import { JsonLd } from "@/lib/seo/jsonld";
type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = async () => (await loadArticles()).map((a) => ({ slug: a.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> { const articles = await loadArticles(); const { slug } = await params; const a = articles.find((x) => x.slug === slug); return a ? { title: a.title, description: a.excerpt, alternates: { canonical: `/journal/${a.slug}` } } : {}; }
export default async function Article({ params }: P) { const articles = await loadArticles(); const { slug } = await params;
  const a = articles.find((x) => x.slug === slug); if (!a) notFound();
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.excerpt || undefined, datePublished: a.date, dateModified: a.date, mainEntityOfPage: `${site.url}/journal/${a.slug}`, publisher: { "@type": "Organization", name: site.name, url: site.url } };
  return (<Page><JsonLd data={ld} /><article className="mx-auto max-w-2xl">
    <h1 className="font-display text-4xl font-semibold text-forest">{a.title}</h1><div className="mt-6 space-y-4 font-display text-lg leading-8">{a.body.map((t, i) => <p key={i}>{t}</p>)}</div></article></Page>);
}

export const revalidate = 60;
