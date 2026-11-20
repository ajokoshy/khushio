import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmbedProducts } from "@/modules/catalog/service";
import { collectProductIds, excerptFrom } from "@/modules/content/document";
import { getVisibleArticle } from "@/modules/content/public";
import { contentMetadata } from "@/modules/content/seo";
import { ARTICLE_TYPE_LABELS } from "@/modules/content/types";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ProductImage } from "@/shared/catalog/product-image";
import { DocumentRenderer } from "@/shared/content/document-renderer";
import { formatArticleDate } from "@/shared/content/article-list";

// Same as CACHE_TTL.articles (5 minutes): a scheduled article appears within this long after its time.
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getVisibleArticle((await params).slug);
  if (!article) return { title: "Article not found", robots: { index: false } };
  return contentMetadata({ title: article.title, description: article.excerpt ?? excerptFrom(article.content), path: `/articles/${article.slug}`, seo: article.seo, coverPublicId: article.coverPublicId, type: "article" });
}

export default async function ArticlePage({ params }: Props) {
  const article = await getVisibleArticle((await params).slug);
  if (!article) notFound();
  const date = formatArticleDate(article.publishAt);
  // One cached lookup for every product the text embeds (live price, picture and store link); hidden products are simply missing.
  const products = await getEmbedProducts(collectProductIds(article.content));
  const isGuide = article.type !== "article";
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, isGuide ? { label: "Guides", href: "/guides" } : { label: "Articles", href: "/articles" }, ...(article.categoryName && article.categorySlug ? [{ label: article.categoryName, href: `/articles/category/${article.categorySlug}` }] : []), { label: article.title }]} />
            {isGuide && <p className="mt-4 text-xs font-medium uppercase tracking-wide text-forest-800">{ARTICLE_TYPE_LABELS[article.type]}</p>}
      <h1 className="mt-2 text-4xl leading-tight">{article.title}</h1>
      <p className="mt-3 text-sm text-ink-600">{[article.authorName ? `By ${article.authorName}` : null, date, `${article.readingMinutes} min read`].filter(Boolean).join(" · ")}</p>
      {article.coverPublicId && (
        <div className="mt-6">
          <ProductImage publicId={article.coverPublicId} alt={article.coverAlt ?? article.title} profiles={["card", "product", "editorial"]} fallback="product" sizes="(min-width: 768px) 768px, 100vw" width={1200} height={630} priority className="aspect-[1200/630] w-full rounded-card object-cover" />
        </div>
      )}
      <div className="mt-8"><DocumentRenderer doc={article.content} products={products} /></div>
      {article.tags.length > 0 && (
        <p className="mt-8 flex flex-wrap gap-2 text-sm">
          {article.tags.map((t) => <Link key={t.slug} href={`/articles/tag/${t.slug}`} className="rounded-full border border-cream-200 px-3 py-1 hover:bg-forest-100">{t.name}</Link>)}
        </p>
      )}
      <p className="mt-8 border-t border-cream-200 pt-4 text-xs text-ink-600">Some links on Khushio are affiliate links. We may earn a commission if you buy through them, at no extra cost to you.</p>
    </article>
  );
}
