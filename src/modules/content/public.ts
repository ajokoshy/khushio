import { unstable_cache } from "next/cache";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import * as repo from "./repository";
import { readingMinutes } from "./document";
import { isArticleType, type ArticleListing, type ArticleType, type PublicArticle, type PublicArticleSummary, type PublicPage } from "./types";
import { isContentVisible } from "./visibility";

/**
 * Public reads for articles, guides and pages (Release 6A, guides added in 6B). Everything is cached under the tag `articles`
 * (every editor write clears it) for CACHE_TTL.articles (5 minutes). A scheduled article needs no cron: lists are filtered with
 * the database clock whenever they are rebuilt, and single articles are filtered again with the clock at call time
 * (isContentVisible), so the only delay left is the page's own 5-minute revalidate.
 */

export const ARTICLES_PER_PAGE = 12;

const options = { revalidate: CACHE_TTL.articles, tags: [CACHE_TAGS.articles] };

/** The cache key of a type filter: unstable_cache arguments are plain text, so the types travel as "guide,review". Empty = every type. */
const typesKey = (types: readonly ArticleType[] | undefined) => [...(types ?? [])].sort().join(",");
const typesFromKey = (key: string): ArticleType[] => key.split(",").filter(isArticleType);

const cachedList = unstable_cache(
  async (categoryId: string | null, tagId: string | null, types: string, offset: number) =>
    repo.selectVisibleArticles({ categoryId: categoryId ?? undefined, tagId: tagId ?? undefined, types: typesFromKey(types), limit: ARTICLES_PER_PAGE + 1, offset }),
  ["articles-list"],
  options,
);
const cachedArticle = unstable_cache(async (slug: string) => repo.selectArticleForReader(slug), ["article-by-slug"], options);
const cachedPage = unstable_cache(async (slug: string) => repo.selectPageForReader(slug), ["page-by-slug"], options);
const cachedTopics = unstable_cache(async () => repo.selectPublicTopics(), ["article-topics"], options);
const cachedCategory = unstable_cache(async (slug: string) => repo.selectActiveCategoryBySlug(slug), ["article-category"], options);
const cachedTag = unstable_cache(async (slug: string) => repo.selectTagBySlug(slug), ["article-tag"], options);
const cachedGuideTypes = unstable_cache(async () => repo.selectVisibleGuideTypes(), ["article-guide-types"], options);

export async function getArticleListing(opts: { page: number; categoryId?: string; tagId?: string; types?: readonly ArticleType[] }): Promise<ArticleListing> {
  const rows = await cachedList(opts.categoryId ?? null, opts.tagId ?? null, typesKey(opts.types), (opts.page - 1) * ARTICLES_PER_PAGE);
  // unstable_cache stores JSON: dates come back as text.
  const articles: PublicArticleSummary[] = rows.slice(0, ARTICLES_PER_PAGE).map((a) => ({ ...a, publishAt: a.publishAt ? new Date(a.publishAt) : null }));
  return { articles, hasNext: rows.length > ARTICLES_PER_PAGE };
}

export async function getVisibleArticle(slug: string, now: Date = new Date()): Promise<(PublicArticle & { readingMinutes: number }) | null> {
  const row = await cachedArticle(slug);
  if (!row) return null;
  const article: PublicArticle = { ...row, publishAt: row.publishAt ? new Date(row.publishAt) : null, updatedAt: new Date(row.updatedAt) };
  return isContentVisible(article, now) ? { ...article, readingMinutes: readingMinutes(article.content) } : null;
}

export async function getVisiblePage(slug: string, now: Date = new Date()): Promise<PublicPage | null> {
  const row = await cachedPage(slug);
  if (!row) return null;
  const found: PublicPage = { ...row, publishAt: row.publishAt ? new Date(row.publishAt) : null, updatedAt: new Date(row.updatedAt) };
  return isContentVisible(found, now) ? found : null;
}

/** The newest visible items for the homepage "guides" section: one cached read, the same list /guides shows. */
export async function getLatestGuides(types: readonly ArticleType[], limit: number): Promise<PublicArticleSummary[]> {
  const { articles } = await getArticleListing({ page: 1, types });
  return articles.slice(0, limit);
}

export const getArticleTopics = () => cachedTopics();
export const getGuideTypes = () => cachedGuideTypes();
export const getTopicBySlug = (slug: string) => cachedCategory(slug);
export const getTagBySlug = (slug: string) => cachedTag(slug);
export const listSitemapContent = (limit: number) => repo.selectSitemapContent(limit);
