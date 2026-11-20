import type { Doc } from "./document";

export const CONTENT_STATUSES = ["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "In review",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export type ContentFilter = "all" | ContentStatus;

/** Release 6B: what kind of piece an article row is. They share one table, one editor and one set of statuses. */
export const ARTICLE_TYPES = ["article", "guide", "review", "comparison", "how-to"] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = {
  article: "Article",
  guide: "Buying guide",
  review: "Review",
  comparison: "Comparison",
  "how-to": "How-to",
};

/** Plural headings for the /guides filter chips and pages. */
export const ARTICLE_TYPE_PLURALS: Record<ArticleType, string> = {
  article: "Articles",
  guide: "Buying guides",
  review: "Reviews",
  comparison: "Comparisons",
  "how-to": "How-tos",
};

/** The types shown under /guides (everything except the plain article). */
export const GUIDE_TYPES = ARTICLE_TYPES.filter((t) => t !== "article") as readonly ArticleType[];

export function isArticleType(value: string): value is ArticleType {
  return (ARTICLE_TYPES as readonly string[]).includes(value);
}

export type TypeFilter = "all" | ArticleType;

/** Slugs an article can not use, because /articles/category/... and /articles/tag/... are listing pages. */
export const RESERVED_ARTICLE_SLUGS: readonly string[] = ["category", "tag"];

export const ROBOTS_VALUES = ["noindex,follow", "noindex,nofollow"] as const;
export type RobotsValue = (typeof ROBOTS_VALUES)[number];

export type SeoFields = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImage: string | null;
  robots: RobotsValue | null;
};

export const EMPTY_SEO: SeoFields = { title: null, description: null, canonical: null, ogImage: null, robots: null };
export const hasAnySeo = (s: SeoFields) => Object.values(s).some((v) => v !== null);

/* ---------------------------------- admin rows ---------------------------------- */

export type ArticleListRow = {
  id: string;
  slug: string;
  title: string;
  type: ArticleType;
  status: ContentStatus;
  publishAt: Date | null;
  updatedAt: Date;
  authorName: string | null;
  categoryName: string | null;
};

export type ArticleRow = ArticleListRow & {
  excerpt: string | null;
  content: Doc;
  authorId: string | null;
  categoryId: string | null;
  coverPublicId: string | null;
  coverAlt: string | null;
};

export type ArticleWrite = {
  slug: string;
  title: string;
  type: ArticleType;
  excerpt: string | null;
  content: Doc;
  status: ContentStatus;
  publishAt: Date | null;
  authorId: string | null;
  categoryId: string | null;
  coverPublicId: string | null;
  coverAlt: string | null;
};

export type PageListRow = { id: string; slug: string; title: string; status: ContentStatus; publishAt: Date | null; updatedAt: Date };
export type PageRow = PageListRow & { content: Doc };
export type PageWrite = { slug: string; title: string; content: Doc; status: ContentStatus; publishAt: Date | null };

export type AuthorRow = { id: string; slug: string; displayName: string; bio: string | null; articleCount: number };
export type CategoryRow = { id: string; slug: string; name: string; description: string | null; sortOrder: number; isActive: boolean; articleCount: number };
export type TagRow = { id: string; slug: string; name: string; articleCount: number };

/* ---------------------------------- public rows ---------------------------------- */

export type PublicArticleSummary = {
  slug: string;
  title: string;
  type: ArticleType;
  excerpt: string | null;
  publishAt: Date | null;
  coverPublicId: string | null;
  coverAlt: string | null;
  authorName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

export type PublicArticle = PublicArticleSummary & {
  id: string;
  status: ContentStatus;
  content: Doc;
  updatedAt: Date;
  tags: { slug: string; name: string }[];
  seo: SeoFields;
};

export type PublicPage = { id: string; slug: string; title: string; status: ContentStatus; publishAt: Date | null; content: Doc; updatedAt: Date; seo: SeoFields };

export type ArticleListing = { articles: PublicArticleSummary[]; hasNext: boolean };
