import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Pagination, SearchBar } from "@/components/Listing";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { categoryChain, loadCategories, searchProducts } from "@/lib/data/catalog";
import { followRedirect } from "@/lib/redirects-db";
import { normalizeSearch } from "@/lib/search-core";
import { listingSeo } from "@/lib/seo/listing";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const revalidate = 21600; // edits refresh pages at once through cache tags; this only bounds staleness
export const generateStaticParams = async () => (await loadCategories()).map((c) => ({ slug: c.slug }));
export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { slug } = await params; const c = (await loadCategories()).find((x) => x.slug === slug); if (!c) return {};
  const s = listingSeo(`/categories/${c.slug}`, await searchParams);
  return { title: s.page > 1 ? `${c.label} (page ${s.page})` : c.label, alternates: { canonical: s.canonical }, robots: s.noindex ? { index: false, follow: true } : undefined };
}
export default async function Category({ params, searchParams }: P) {
  const { slug } = await params; const cats = await loadCategories(); const c = cats.find((x) => x.slug === slug);
  if (!c) { await followRedirect(`/categories/${slug}`); notFound(); }
  const sp = await searchParams, f = normalizeSearch(sp as Parameters<typeof normalizeSearch>[0]);
  const r = await searchProducts({ ...(sp as object), cat: undefined, categories: [c.slug] });
  const kids = cats.filter((k) => k.parentId && k.parentId === c.id);
  const crumbs = categoryChain(cats, c.slug).map((x) => ({ name: x.label, href: `/categories/${x.slug}` }));
  return (<Page><Breadcrumbs items={crumbs} /><PageHead title={c.label} />
    {kids.length > 0 && <ul className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Sub-categories">{kids.map((k) => <li key={k.slug}><Link className="rounded-full border border-sand bg-white px-4 py-1.5 hover:border-terracotta" href={`/categories/${k.slug}`}>{k.label}</Link></li>)}</ul>}
    <SearchBar action={`/categories/${c.slug}`} q={f.q} sort={f.sort} min={f.min} max={f.max} />
    {r.items.length ? <><Grid>{r.items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid><Pagination path={`/categories/${c.slug}`} params={{ q: f.q, min: f.min, max: f.max, sort: sp.sort as string | undefined }} page={r.page} pages={r.pages} /></>
      : <p>{f.q || f.min || f.max ? "No products match these filters." : "Products for this category are coming soon."}</p>}</Page>);
}
