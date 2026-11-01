import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Pagination } from "@/components/Listing";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { searchProducts } from "@/lib/data/catalog";
import { loadOccasion, loadOccasions } from "@/lib/data/occasions";
import { followRedirect } from "@/lib/redirects-db";
import { listingSeo } from "@/lib/seo/listing";
type P = { params: Promise<{ occasion: string }>; searchParams: Promise<{ page?: string }> };
export const revalidate = 21600;
export const generateStaticParams = async () => (await loadOccasions()).map((o) => ({ occasion: o.slug }));
export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const o = await loadOccasion((await params).occasion); if (!o) return {};
  const s = listingSeo(`/gifts/${o.slug}`, await searchParams);
  return { title: s.page > 1 ? `${o.title} (page ${s.page})` : o.title, description: o.intro || `Gift ideas: ${o.title}.`, alternates: { canonical: s.canonical } };
}
export default async function Occasion({ params, searchParams }: P) {
  const { occasion } = await params, o = await loadOccasion(occasion);
  if (!o) { await followRedirect(`/gifts/${occasion}`); notFound(); }
  const r = await searchProducts({ categories: o.categories.length ? o.categories : undefined, min: o.minPrice, max: o.maxPrice, q: o.query || undefined, sort: o.query ? "relevance" : "featured", page: (await searchParams).page });
  return (<Page><Breadcrumbs items={[{ name: "Gifts", href: "/gifts" }, { name: o.title, href: `/gifts/${o.slug}` }]} /><PageHead title={o.title} intro={o.intro} />
    {r.items.length ? <><Grid>{r.items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid><Pagination path={`/gifts/${o.slug}`} params={{}} page={r.page} pages={r.pages} /></> : <p>Nothing matches this idea just yet.</p>}</Page>);
}
