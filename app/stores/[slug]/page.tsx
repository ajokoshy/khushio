import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Pagination } from "@/components/Listing";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadMerchantName, loadStoreSlugs, searchProducts } from "@/lib/data/catalog";
import { listingSeo } from "@/lib/seo/listing";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const revalidate = 21600; // edits refresh pages at once through cache tags; this only bounds staleness
export const generateStaticParams = async () => (await loadStoreSlugs()).map((slug) => ({ slug }));
export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { slug } = await params; const name = await loadMerchantName(slug); if (!name) return {};
  const s = listingSeo(`/stores/${slug}`, await searchParams);
  return { title: `Shop from ${name}`, alternates: { canonical: s.canonical }, robots: s.noindex ? { index: false, follow: true } : undefined };
}
export default async function Store({ params, searchParams }: P) {
  const { slug } = await params; const name = await loadMerchantName(slug); if (!name) notFound();
  const sp = await searchParams; const r = await searchProducts({ page: sp.page as string | undefined, merchant: slug });
  return (<Page><Breadcrumbs items={[{ name, href: `/stores/${slug}` }]} /><PageHead title={`Shop from ${name}`} />
    <Grid>{r.items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid><Pagination path={`/stores/${slug}`} params={{}} page={r.page} pages={r.pages} /></Page>);
}
