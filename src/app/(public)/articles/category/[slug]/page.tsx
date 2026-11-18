import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/core/config/env";
import { getArticleListing, getTopicBySlug } from "@/modules/content/public";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ArticleGrid, EmptyArticles, ListPager, pageFrom } from "@/shared/content/article-list";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [topic, page] = [await getTopicBySlug(slug), pageFrom((await searchParams).page)];
  if (!topic) return { title: "Not found", robots: { index: false } };
  return {
    title: `${topic.name} articles`,
    description: topic.description ?? `Articles and guides about ${topic.name} from Khushio.`,
    alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}/articles/category/${topic.slug}` },
    robots: page > 1 ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function TopicPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const topic = await getTopicBySlug(slug);
  if (!topic) notFound();
  const page = pageFrom((await searchParams).page);
  const listing = await getArticleListing({ page, categoryId: topic.id });
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Articles", href: "/articles" }, { label: topic.name }]} />
      <h1 className="mt-4 text-3xl">{topic.name}</h1>
      {topic.description && <p className="mt-2 max-w-prose text-ink-600">{topic.description}</p>}
      <div className="mt-6">{listing.articles.length > 0 ? <ArticleGrid articles={listing.articles} /> : <EmptyArticles />}</div>
      <ListPager basePath={`/articles/category/${topic.slug}`} page={page} hasNext={listing.hasNext} />
    </section>
  );
}
