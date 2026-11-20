import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/core/config/env";
import { getArticleListing, getGuideTypes } from "@/modules/content/public";
import { ARTICLE_TYPE_PLURALS, GUIDE_TYPES } from "@/modules/content/types";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ArticleGrid, EmptyArticles, ListPager, pageFrom } from "@/shared/content/article-list";

// Same as CACHE_TTL.articles (5 minutes): a scheduled guide appears within this long after its time.
export const revalidate = 300;

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageFrom((await searchParams).page);
  return {
    title: "Buying guides, reviews and comparisons",
    description: "Buying guides, reviews, comparisons and how-tos from Khushio, with the products we recommend.",
    alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}/guides` },
    robots: page > 1 ? { index: false, follow: true } : { index: true, follow: true },
  };
}

const buildingWithoutDatabase = process.env.NEXT_PHASE === "phase-production-build" && !env.DATABASE_URL;

export default async function GuidesPage({ searchParams }: Props) {
  const page = pageFrom((await searchParams).page);
  const [listing, types] = buildingWithoutDatabase ? [{ articles: [], hasNext: false }, []] : await Promise.all([getArticleListing({ page, types: GUIDE_TYPES }), getGuideTypes()]);
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Guides" }]} />
      <h1 className="mt-4 text-3xl">Guides, reviews and comparisons</h1>
      {types.length > 0 && (
        <nav aria-label="Kinds of guide" className="mt-4 flex flex-wrap gap-2">
          {types.map((t) => <Link key={t} href={`/guides/${t}`} className="rounded-full border border-cream-200 px-3 py-1 text-sm hover:bg-forest-100">{ARTICLE_TYPE_PLURALS[t]}</Link>)}
        </nav>
      )}
      <div className="mt-6">{listing.articles.length > 0 ? <ArticleGrid articles={listing.articles} /> : <EmptyArticles />}</div>
      <ListPager basePath="/guides" page={page} hasNext={listing.hasNext} label="More guides" />
    </section>
  );
}
