import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { articleState, toLocalInput, type ArticleState } from "@/lib/journal-core";
const UUID = /^[0-9a-f-]{36}$/i;
const PAGE = 25;

export async function listArticlesAdmin({ q = "", state, page = 1 }: { q?: string; state?: ArticleState; page?: number }) {
  if (!db) return { items: [], total: 0, pages: 1, page: 1 };
  const term = q.trim().slice(0, 80).replace(/[\\%_]/g, ""), where = [sql`true`];
  if (term) where.push(sql`a.title ilike ${`%${term}%`}`);
  if (state === "draft") where.push(sql`a.status <> 'published'`);
  if (state === "scheduled") where.push(sql`a.status = 'published' and a.publish_at > now()`);
  if (state === "live") where.push(sql`a.status = 'published' and (a.publish_at is null or a.publish_at <= now())`);
  const w = sql.join(where, sql` and `);
  const total = Number(((await db.execute(sql`select count(*)::int as n from articles a where ${w}`)).rows as { n: number }[])[0]?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE)), p = Math.min(Math.max(1, page), pages);
  const rows = (await db.execute(sql`select a.id, a.title, a.slug, a.status, a.publish_at, a.updated_at, ac.name as cat from articles a left join article_categories ac on ac.id = a.category_id where ${w} order by a.updated_at desc nulls last, a.id limit ${PAGE} offset ${(p - 1) * PAGE}`)).rows as Record<string, unknown>[];
  return { total, pages, page: p, items: rows.map((r) => { const at = r.publish_at ? new Date(r.publish_at as string) : null; return { id: String(r.id), title: String(r.title), slug: String(r.slug), cat: r.cat ? String(r.cat) : null, publishAt: at, updatedAt: r.updated_at ? new Date(r.updated_at as string) : null, state: articleState(String(r.status), at) }; }) };
}

export async function loadArticleAdmin(id: string) {
  if (!db || !UUID.test(id)) return undefined;
  const [a] = await db.select().from(schema.articles).where(eq(schema.articles.id, id)); if (!a) return undefined;
  const [cat] = a.categoryId ? await db.select({ slug: schema.articleCategories.slug }).from(schema.articleCategories).where(eq(schema.articleCategories.id, a.categoryId)) : [];
  const revisions = await db.select({ id: schema.articleRevisions.id, title: schema.articleRevisions.title, createdAt: schema.articleRevisions.createdAt }).from(schema.articleRevisions).where(eq(schema.articleRevisions.articleId, id)).orderBy(desc(schema.articleRevisions.createdAt));
  return { ...a, categorySlug: cat?.slug ?? "", publishAtInput: toLocalInput(a.publishAt), revisions };
}
export const loadCategoriesAdmin = async () => (db ? db.select().from(schema.articleCategories).orderBy(asc(schema.articleCategories.position), asc(schema.articleCategories.name)) : []);
