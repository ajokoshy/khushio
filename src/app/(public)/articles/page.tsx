import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/modules/seo/metadata";
import { getArticleListing, getArticleTopics } from "@/modules/content/public";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ArticleGrid, EmptyArticles, ListPager, pageFrom } from "@/shared/content/article-list";

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageFrom((await searchParams).page);
  return buildMetadata({ title: "Articles and guides", description: "Shopping guides, buying advice and stories from Khushio.", path: "/articles", page });
}

const buildingWithoutDatabase = process.env.NEXT_PHASE === "phase-production-build" && !process.env.DATABASE_URL;

export default async function ArticlesPage({ searchParams }: Props) {
  const page = pageFrom((await searchParams).page);
  const [listing, topics] = buildingWithoutDatabase ? [{ articles: [], hasNext: false }, []] : await Promise.all([getArticleListing({ page }), getArticleTopics()]);
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Articles" }]} />
      <h1 className="mt-4 text-3xl">Articles and guides</h1>
      {topics.length > 0 && (
        <nav aria-label="Topics" className="mt-4 flex flex-wrap gap-2">
          {topics.map((t) => <Link key={t.slug} href={`/articles/category/${t.slug}`} className="rounded-full border border-cream-200 px-3 py-1 text-sm hover:bg-forest-100">{t.name}</Link>)}
        </nav>
      )}
      <div className="mt-6">{listing.articles.length > 0 ? <ArticleGrid articles={listing.articles} /> : <EmptyArticles />}</div>
      <ListPager basePath="/articles" page={page} hasNext={listing.hasNext} />
    </section>
  );
}
