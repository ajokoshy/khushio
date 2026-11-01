import { sql } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { articles as sampleArticles } from "@/lib/data/catalog";
import { db } from "@/lib/db";
import { JOURNAL_PAGE_SIZE } from "@/lib/journal-core";
import type { MediaInfo } from "@/lib/data/media";

export type JournalCard = { slug: string; title: string; excerpt: string; author: string; publishedAt: string; category?: { slug: string; name: string }; tags: string[]; cover?: MediaInfo; readMinutes: number };
export type JournalArticle = JournalCard & { body: string; updatedAt?: string; seoTitle?: string; seoDescription?: string; productSlugs: string[] };

/** Postgres arrays arrive as JS arrays from most drivers, but as "{a,b}" text from some; accept both. */
export function pgArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.startsWith("{") && v.endsWith("}")) return v.slice(1, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).filter(Boolean);
  return [];
}
const LIVE = sql`a.status = 'published' and (a.publish_at is null or a.publish_at <= now())`;
const BASE = sql`from articles a left join article_categories ac on ac.id = a.category_id left join media m on m.id = a.cover_media_id`;
const FIELDS = sql`a.slug, a.title, a.excerpt, a.author, a.tags, coalesce(a.publish_at, a.created_at) as published_at, ac.slug as cat_slug, ac.name as cat_name, m.id as m_id, m.public_id as m_public_id, m.alt as m_alt, m.width as m_width, m.height as m_height,
  greatest(1, round(coalesce(array_length(regexp_split_to_array(trim(a.body), '\s+'), 1), 0) / 200.0))::int as minutes`;
type Row = Record<string, unknown>;
const toCard = (r: Row): JournalCard => ({
  slug: String(r.slug), title: String(r.title), excerpt: String(r.excerpt), author: String(r.author), publishedAt: new Date(r.published_at as string).toISOString(), tags: pgArray(r.tags), readMinutes: Number(r.minutes) || 1,
  category: r.cat_slug ? { slug: String(r.cat_slug), name: String(r.cat_name) } : undefined,
  cover: r.m_id ? { id: String(r.m_id), publicId: String(r.m_public_id), alt: String(r.m_alt), width: r.m_width as number | null, height: r.m_height as number | null } : undefined,
});
const sampleCard = (a: (typeof sampleArticles)[number]): JournalArticle => ({ slug: a.slug, title: a.title, excerpt: a.excerpt, author: "", publishedAt: new Date(a.date).toISOString(), tags: [], readMinutes: 1, body: a.body.join("\n\n"), productSlugs: [] });
const useSamples = () => !db && process.env.NODE_ENV !== "production";

export type JournalList = { items: JournalCard[]; total: number; pages: number; page: number };
export const listArticles = cached(async (opts: { page?: number; category?: string; tag?: string }): Promise<JournalList> => {
  const size = JOURNAL_PAGE_SIZE, req = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), 500);
  if (!db) { const all = useSamples() ? sampleArticles.map(sampleCard) : []; const pages = Math.max(1, Math.ceil(all.length / size)), page = Math.min(req, pages); return { items: all.slice((page - 1) * size, page * size), total: all.length, pages, page }; }
  const where = [LIVE]; if (opts.category) where.push(sql`ac.slug = ${opts.category}`); if (opts.tag) where.push(sql`${opts.tag} = any(a.tags)`);
  const w = sql.join(where, sql` and `);
  const total = Number(((await db.execute(sql`select count(*)::int as n ${BASE} where ${w}`)).rows as { n: number }[])[0]?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / size)), page = Math.min(req, pages);
  const rows = (await db.execute(sql`select ${FIELDS} ${BASE} where ${w} order by coalesce(a.publish_at, a.created_at) desc, a.id limit ${size} offset ${(page - 1) * size}`)).rows as Row[];
  return { items: rows.map(toCard), total, pages, page };
}, "journal-list", ["articles", "media"], 1800);

const full = async (where: ReturnType<typeof sql>): Promise<JournalArticle | undefined> => {
  const r = ((await db!.execute(sql`select ${FIELDS}, a.body, a.updated_at, a.seo_title, a.seo_description, a.product_slugs ${BASE} where ${where} limit 1`)).rows as Row[])[0];
  return r ? { ...toCard(r), body: String(r.body), updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined, seoTitle: (r.seo_title as string) || undefined, seoDescription: (r.seo_description as string) || undefined, productSlugs: pgArray(r.product_slugs) } : undefined;
};
export const loadArticle = cached(async (slug: string): Promise<JournalArticle | undefined> => {
  if (!db) return useSamples() ? sampleArticles.filter((a) => a.slug === slug).map(sampleCard)[0] : undefined;
  return full(sql`${LIVE} and a.slug = ${slug}`);
}, "journal-article", ["articles", "media"], 1800);
/** Any status, by id: admin preview only. Never cached. */
export async function loadArticleForPreview(id: string) { return db && /^[0-9a-f-]{36}$/i.test(id) ? full(sql`a.id = ${id}`) : undefined; }

export type JournalCategory = { slug: string; name: string; description: string; count: number };
export const loadJournalCategories = cached(async (): Promise<JournalCategory[]> => {
  if (!db) return [];
  const rows = (await db.execute(sql`select ac.slug, ac.name, ac.description, count(a.id) filter (where ${LIVE})::int as n from article_categories ac left join articles a on a.category_id = ac.id group by ac.id order by ac.position, ac.name`)).rows as Row[];
  return rows.map((r) => ({ slug: String(r.slug), name: String(r.name), description: String(r.description), count: Number(r.n) }));
}, "journal-categories", ["articles"], 1800);

/** Articles sharing the category or tags, most overlap first, then newest. */
export const loadRelatedArticles = cached(async (slug: string, limit: number = 3): Promise<JournalCard[]> => {
  if (!db) return [];
  const rows = (await db.execute(sql`with me as (select tags, category_id from articles where slug = ${slug})
    select ${FIELDS} ${BASE}, me
    where ${LIVE} and a.slug <> ${slug} and (a.category_id = me.category_id or a.tags && me.tags)
    order by cardinality(array(select unnest(a.tags) intersect select unnest(me.tags))) desc, coalesce(a.publish_at, a.created_at) desc limit ${limit}`)).rows as Row[];
  return rows.map(toCard);
}, "journal-related", ["articles", "media"], 1800);

/** Articles that embed a product card, for the "From the journal" block on product pages. */
export const loadArticlesForProduct = cached(async (productSlug: string, limit = 3): Promise<JournalCard[]> => {
  if (!db) return [];
  return ((await db.execute(sql`select ${FIELDS} ${BASE} where ${LIVE} and a.product_slugs @> array[${productSlug}]::text[] order by coalesce(a.publish_at, a.created_at) desc limit ${limit}`)).rows as Row[]).map(toCard);
}, "journal-for-product", ["articles", "media"], 21600);

/** Slugs and dates for the sitemap and static generation: articles and categories. */
export const loadJournalSlugs = cached(async (): Promise<{ articles: { slug: string; updatedAt?: string }[]; categories: string[] }> => {
  if (!db) return { articles: useSamples() ? sampleArticles.map((a) => ({ slug: a.slug })) : [], categories: [] };
  const a = ((await db.execute(sql`select a.slug, a.updated_at from articles a where ${LIVE} order by a.created_at`)).rows as Row[]).map((r) => ({ slug: String(r.slug), updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined }));
  const c = ((await db.execute(sql`select ac.slug from article_categories ac where exists (select 1 from articles a where a.category_id = ac.id and ${LIVE})`)).rows as Row[]).map((r) => String(r.slug));
  return { articles: a, categories: c };
}, "journal-slugs", ["articles"], 21600);
