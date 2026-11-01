import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CompareTable } from "@/components/CompareTable";
import { Prose } from "@/components/Prose";
import { Page, PageHead } from "@/components/ProductCard";
import { loadProductsBySlugs } from "@/lib/data/catalog";
import { loadComparison, loadComparisons } from "@/lib/data/comparisons";
import { parseMarkdown } from "@/lib/markdown";
import { followRedirect } from "@/lib/redirects-db";
type P = { params: Promise<{ slug: string }> };
export const revalidate = 21600;
export const generateStaticParams = async () => (await loadComparisons()).map((c) => ({ slug: c.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const c = await loadComparison((await params).slug); return c ? { title: c.title, description: c.intro || undefined, alternates: { canonical: `/compare/${c.slug}` } } : {};
}
export default async function CuratedComparison({ params }: P) {
  const { slug } = await params, c = await loadComparison(slug);
  if (!c) { await followRedirect(`/compare/${slug}`); notFound(); }
  const items = await loadProductsBySlugs(c.productSlugs);
  return (<Page><Breadcrumbs items={[{ name: "Compare", href: "/compare" }, { name: c.title, href: `/compare/${c.slug}` }]} /><PageHead title={c.title} intro={c.intro} />
    {items.length > 1 ? <CompareTable items={items} /> : <p>These products are not available right now.</p>}
    {c.verdict && <section aria-labelledby="verdict" className="mt-10 max-w-2xl"><h2 id="verdict" className="mb-3 font-display text-2xl font-semibold text-forest">Our verdict</h2><Prose blocks={parseMarkdown(c.verdict)} /></section>}</Page>);
}
