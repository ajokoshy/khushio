import { extractMediaIds, extractProductSlugs, excerptOf, parseMarkdown, readingMinutes } from "./markdown";
import { slugify } from "./slug";

export const ARTICLE_LIMITS = { title: 140, excerpt: 300, body: 60_000, author: 80, seoTitle: 70, seoDescription: 170, tags: 8, tagLength: 30 } as const;
/** Older revisions are pruned on every save so history never grows. */
export const MAX_REVISIONS = 5;
export const JOURNAL_PAGE_SIZE = 9;

/** "Jute, Home decor, jute" -> ["jute", "home-decor"] (lower case, de-duplicated, bounded). */
export function cleanTags(input: string): string[] {
  const out: string[] = [];
  for (const t of input.split(/[,\n]/)) { const s = slugify(t).slice(0, ARTICLE_LIMITS.tagLength); if (s && !out.includes(s)) out.push(s); if (out.length >= ARTICLE_LIMITS.tags) break; }
  return out;
}

/** A "datetime-local" value ("2026-12-31T09:30") is read as India time. Returns null when empty or invalid. */
export function parsePublishAt(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+05:30`); return Number.isNaN(+d) ? null : d;
}
/** The value to show again in a datetime-local input (India time). */
export const toLocalInput = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : "");
export const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export type ArticleState = "draft" | "scheduled" | "live";
export const articleState = (status: string, publishAt: Date | null | undefined, now = new Date()): ArticleState => (status !== "published" ? "draft" : publishAt && publishAt.getTime() > now.getTime() ? "scheduled" : "live");

/** Everything derived from the body once, at save time (so pages never re-parse to find it). */
export function deriveFromBody(body: string) {
  const blocks = parseMarkdown(body);
  return { productSlugs: extractProductSlugs(blocks), mediaIds: extractMediaIds(blocks), excerpt: excerptOf(blocks, 200), readMinutes: readingMinutes(body) };
}

export type ArticleInput = { title: string; slug: string; excerpt: string; body: string; author: string; seoTitle: string | null; seoDescription: string | null };
export type ArticleError = "title" | "body" | "slug" | "title-long" | "body-long";
export function cleanArticle(raw: { title: string; slug: string; excerpt: string; body: string; author: string; seoTitle: string; seoDescription: string }): { ok: true; value: ArticleInput } | { ok: false; error: ArticleError } {
  const title = raw.title.trim().replace(/\s+/g, " "), body = raw.body.replace(/\r\n?/g, "\n").trim();
  if (!title) return { ok: false, error: "title" }; if (title.length > ARTICLE_LIMITS.title) return { ok: false, error: "title-long" };
  if (!body) return { ok: false, error: "body" }; if (body.length > ARTICLE_LIMITS.body) return { ok: false, error: "body-long" };
  const slug = slugify(raw.slug || title); if (!slug) return { ok: false, error: "slug" };
  return { ok: true, value: { title, slug, body, excerpt: raw.excerpt.trim().slice(0, ARTICLE_LIMITS.excerpt) || deriveFromBody(body).excerpt, author: raw.author.trim().slice(0, ARTICLE_LIMITS.author),
    seoTitle: raw.seoTitle.trim().slice(0, ARTICLE_LIMITS.seoTitle) || null, seoDescription: raw.seoDescription.trim().slice(0, ARTICLE_LIMITS.seoDescription) || null } };
}
