import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/core/config/env";
import { getArticleListing, getTagBySlug } from "@/modules/content/public";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ArticleGrid, EmptyArticles, ListPager, pageFrom } from "@/shared/content/article-list";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

/** Tag pages are for browsing: they stay out of search results so thin, overlapping lists do not compete with the articles. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = await getTagBySlug((await params).slug);
  if (!tag) return { title: "Not found", robots: { index: false } };
  return { title: `Articles tagged ${tag.name}`, alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}/articles/tag/${tag.slug}` }, robots: { index: false, follow: true } };
}

export default async function TagPage({ params, searchParams }: Props) {
  const tag = await getTagBySlug((await params).slug);
  if (!tag) notFound();
  const page = pageFrom((await searchParams).page);
  const listing = await getArticleListing({ page, tagId: tag.id });
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Articles", href: "/articles" }, { label: `Tagged ${tag.name}` }]} />
      <h1 className="mt-4 text-3xl">Tagged “{tag.name}”</h1>
      <div className="mt-6">{listing.articles.length > 0 ? <ArticleGrid articles={listing.articles} /> : <EmptyArticles />}</div>
      <ListPager basePath={`/articles/tag/${tag.slug}`} page={page} hasNext={listing.hasNext} />
    </section>
  );
}
