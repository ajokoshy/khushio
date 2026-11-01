import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/ArticleCard";
import { ArticleView } from "@/components/ArticleView";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Pagination } from "@/components/Listing";
import { Grid, Page, PageHead } from "@/components/ProductCard";
import { site } from "@/lib/config/site";
import { loadProductsBySlugs, type Product } from "@/lib/data/catalog";
import { listArticles, loadArticle, loadJournalCategories, loadJournalSlugs, loadRelatedArticles } from "@/lib/data/journal";
import { loadMediaMap } from "@/lib/data/media";
import { extractMediaIds, extractProductSlugs, parseMarkdown } from "@/lib/markdown";
import { imgUrl } from "@/lib/media/delivery";
import { followRedirect } from "@/lib/redirects-db";
import { JsonLd } from "@/lib/seo/jsonld";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };
// One address space for articles and categories (/journal/<article> and /journal/<category>). An article wins a name clash.
export const revalidate = 1800;
export const generateStaticParams = async () => { const j = await loadJournalSlugs(); return [...j.articles.map((a) => ({ slug: a.slug })), ...j.categories.map((slug) => ({ slug }))]; };
const categoryOf = async (slug: string) => (await loadJournalCategories()).find((c) => c.slug === slug);
export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { slug } = await params, a = await loadArticle(slug);
  if (a) return { title: a.seoTitle || a.title, description: a.seoDescription || a.excerpt || undefined, alternates: { canonical: `/journal/${a.slug}` }, openGraph: a.cover ? { images: [imgUrl(a.cover.publicId, 1280)] } : undefined };
  const c = await categoryOf(slug), page = Math.max(1, Math.floor(Number((await searchParams).page)) || 1);
  return c ? { title: page > 1 ? `${c.name} (page ${page})` : c.name, description: c.description || undefined, alternates: { canonical: page > 1 ? `/journal/${c.slug}?page=${page}` : `/journal/${c.slug}` } } : {};
}
export default async function JournalSlug({ params, searchParams }: P) {
  const { slug } = await params, a = await loadArticle(slug);
  if (!a) {
    const c = await categoryOf(slug);
    if (!c) { await followRedirect(`/journal/${slug}`); notFound(); }
    const list = await listArticles({ category: c.slug, page: Math.floor(Number((await searchParams).page)) || 1 });
    return (<Page><Breadcrumbs items={[{ name: "Journal", href: "/journal" }, { name: c.name, href: `/journal/${c.slug}` }]} /><PageHead title={c.name} intro={c.description} />
      {list.items.length ? <><Grid>{list.items.map((x) => <ArticleCard key={x.slug} a={x} />)}</Grid><Pagination path={`/journal/${c.slug}`} params={{}} page={list.page} pages={list.pages} /></> : <p>No articles in this category yet.</p>}</Page>);
  }
  const blocks = parseMarkdown(a.body);
  const [prods, media, related] = await Promise.all([loadProductsBySlugs(extractProductSlugs(blocks)), loadMediaMap(extractMediaIds(blocks)), loadRelatedArticles(a.slug)]);
  const products = Object.fromEntries(prods.map((p: Product) => [p.slug, p]));
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.excerpt || undefined, datePublished: a.publishedAt, dateModified: a.updatedAt ?? a.publishedAt, mainEntityOfPage: `${site.url}/journal/${a.slug}`,
    image: a.cover ? [imgUrl(a.cover.publicId, 1280)] : undefined, author: a.author ? { "@type": "Person", name: a.author } : { "@type": "Organization", name: site.name }, publisher: { "@type": "Organization", name: site.name, url: site.url } };
  return (<Page><JsonLd data={ld} /><Breadcrumbs items={[{ name: "Journal", href: "/journal" }, ...(a.category ? [{ name: a.category.name, href: `/journal/${a.category.slug}` }] : []), { name: a.title, href: `/journal/${a.slug}` }]} />
    <ArticleView a={a} products={products} media={media} related={related} /></Page>);
}
