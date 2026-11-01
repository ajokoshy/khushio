import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pagination, SearchBar } from "@/components/Listing";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadBrands, searchProducts } from "@/lib/data/catalog";
import { followRedirect } from "@/lib/redirects-db";
import { normalizeSearch } from "@/lib/search-core";
import { listingSeo } from "@/lib/seo/listing";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const revalidate = 21600; // edits refresh pages at once through cache tags; this only bounds staleness
export const generateStaticParams = async () => (await loadBrands()).map((b) => ({ slug: b.slug }));
export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { slug } = await params; const b = (await loadBrands()).find((x) => x.slug === slug); if (!b) return {};
  const s = listingSeo(`/brands/${b.slug}`, await searchParams);
  return { title: s.page > 1 ? `${b.name} (page ${s.page})` : b.name, description: b.about || undefined, alternates: { canonical: s.canonical }, robots: s.noindex ? { index: false, follow: true } : undefined };
}
export default async function Brand({ params, searchParams }: P) {
  const { slug } = await params; const b = (await loadBrands()).find((x) => x.slug === slug);
  if (!b) { await followRedirect(`/brands/${slug}`); notFound(); }
  const sp = await searchParams, f = normalizeSearch(sp as Parameters<typeof normalizeSearch>[0]);
  const r = await searchProducts({ ...(sp as object), brand: b.slug });
  return (<Page><PageHead title={b.name} intro={b.about} />
    <SearchBar action={`/brands/${b.slug}`} q={f.q} sort={f.sort} min={f.min} max={f.max} />
    {r.items.length ? <><Grid>{r.items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid><Pagination path={`/brands/${b.slug}`} params={{ q: f.q, min: f.min, max: f.max, sort: sp.sort as string | undefined }} page={r.page} pages={r.pages} /></> : <p>No products from this brand yet.</p>}</Page>);
}
