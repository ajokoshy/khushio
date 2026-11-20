import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/core/config/env";
import { getArticleListing, getGuideTypes } from "@/modules/content/public";
import { ARTICLE_TYPE_PLURALS, GUIDE_TYPES, isArticleType, type ArticleType } from "@/modules/content/types";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ArticleGrid, EmptyArticles, ListPager, pageFrom } from "@/shared/content/article-list";

export const revalidate = 300;

type Props = { params: Promise<{ type: string }>; searchParams: Promise<{ page?: string | string[] }> };

/** Only the four guide kinds have a page here (a plain article's list is /articles); anything else is a 404. */
const guideType = (value: string): ArticleType | null => (isArticleType(value) && GUIDE_TYPES.includes(value) ? value : null);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const type = guideType((await params).type);
  if (!type) return { title: "Not found", robots: { index: false } };
  const page = pageFrom((await searchParams).page);
  return {
    title: ARTICLE_TYPE_PLURALS[type],
    description: `${ARTICLE_TYPE_PLURALS[type]} from Khushio, with the products we recommend.`,
    alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}/guides/${type}` },
    robots: page > 1 ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function GuideTypePage({ params, searchParams }: Props) {
  const type = guideType((await params).type);
  if (!type) notFound();
  const page = pageFrom((await searchParams).page);
  const [listing, types] = await Promise.all([getArticleListing({ page, types: [type] }), getGuideTypes()]);
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Guides", href: "/guides" }, { label: ARTICLE_TYPE_PLURALS[type] }]} />
      <h1 className="mt-4 text-3xl">{ARTICLE_TYPE_PLURALS[type]}</h1>
      {types.length > 1 && (
        <nav aria-label="Kinds of guide" className="mt-4 flex flex-wrap gap-2">
          <Link href="/guides" className="rounded-full border border-cream-200 px-3 py-1 text-sm hover:bg-forest-100">All guides</Link>
          {types.map((t) => <Link key={t} href={`/guides/${t}`} aria-current={t === type ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm hover:bg-forest-100 ${t === type ? "border-forest-800 bg-forest-100" : "border-cream-200"}`}>{ARTICLE_TYPE_PLURALS[t]}</Link>)}
        </nav>
      )}
      <div className="mt-6">{listing.articles.length > 0 ? <ArticleGrid articles={listing.articles} /> : <EmptyArticles />}</div>
      <ListPager basePath={`/guides/${type}`} page={page} hasNext={listing.hasNext} label="More guides" />
    </section>
  );
}
