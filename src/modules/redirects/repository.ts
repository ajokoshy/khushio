import { asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/core/database/client";
import { articles, brands, categories, merchants, pages, products, redirects } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import type { RedirectRule, RedirectStatus } from "./path";
import type { RedirectRow, RedirectSource, RedirectWrite } from "./types";

/** Repository: the only code in this module that talks to the database. */

const columns = {
  id: redirects.id,
  fromPath: redirects.fromPath,
  toPath: redirects.toPath,
  statusCode: redirects.statusCode,
  source: redirects.source,
  createdAt: redirects.createdAt,
  updatedAt: redirects.updatedAt,
};
const asRow = (r: { id: string; fromPath: string; toPath: string | null; statusCode: number; source: string; createdAt: Date; updatedAt: Date }): RedirectRow => ({
  ...r,
  statusCode: r.statusCode as RedirectStatus,
  source: r.source as RedirectSource,
});

/** The most addresses the map will ever carry; the admin screen warns long before this. */
export const MAP_LIMIT = 5000;

/** Every rule, in the compact form the middleware needs. One cheap read, cached for an hour by public.ts. */
export async function selectAllRules(limit = MAP_LIMIT): Promise<RedirectRule[]> {
  const rows = await db().select({ fromPath: redirects.fromPath, toPath: redirects.toPath, statusCode: redirects.statusCode }).from(redirects).orderBy(asc(redirects.fromPath)).limit(limit);
  return rows.map((r) => ({ ...r, statusCode: r.statusCode as RedirectStatus }));
}

export async function selectRules(opts: { q?: string; limit: number; offset: number }): Promise<RedirectRow[]> {
  const pattern = opts.q ? `%${escapeLike(opts.q.trim())}%` : null;
  const rows = await db()
    .select(columns)
    .from(redirects)
    .where(pattern ? or(ilike(redirects.fromPath, pattern), ilike(redirects.toPath, pattern)) : undefined)
    .orderBy(desc(redirects.updatedAt), asc(redirects.fromPath))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows.map(asRow);
}

export async function selectRuleById(id: string): Promise<RedirectRow | null> {
  const [row] = await db().select(columns).from(redirects).where(eq(redirects.id, id)).limit(1);
  return row ? asRow(row) : null;
}

export async function countRules(): Promise<number> {
  const [row] = await db().select({ n: sql<number>`count(*)::int` }).from(redirects);
  return row?.n ?? 0;
}

export async function insertRule(values: RedirectWrite, source: RedirectSource): Promise<string> {
  const [row] = await db().insert(redirects).values({ ...values, source }).returning({ id: redirects.id });
  if (!row) throw new Error("Redirect insert returned no row");
  return row.id;
}

export async function updateRuleRow(id: string, values: RedirectWrite): Promise<void> {
  await db().update(redirects).set({ ...values, source: "manual" }).where(eq(redirects.id, id));
}

export async function deleteRuleRow(id: string): Promise<void> {
  await db().delete(redirects).where(eq(redirects.id, id));
}

export async function deleteRuleByFrom(fromPath: string): Promise<void> {
  await db().delete(redirects).where(eq(redirects.fromPath, fromPath));
}

/** The slugs among `slugs` that exist in each table a public address can come from (any status: a draft will take the address when it is published). */
export async function selectExistingSlugs(wanted: { products: string[]; categories: string[]; brands: string[]; stores: string[]; articles: string[]; pages: string[] }): Promise<{ [K in keyof typeof wanted]: string[] }> {
  const d = db();
  const pick = async (table: typeof products | typeof categories | typeof brands | typeof merchants | typeof articles | typeof pages, list: string[]) =>
    list.length === 0 ? [] : (await d.select({ slug: table.slug }).from(table).where(inArray(table.slug, list))).map((r) => r.slug);
  const [p, c, b, s, a, g] = await Promise.all([pick(products, wanted.products), pick(categories, wanted.categories), pick(brands, wanted.brands), pick(merchants, wanted.stores), pick(articles, wanted.articles), pick(pages, wanted.pages)]);
  return { products: p, categories: c, brands: b, stores: s, articles: a, pages: g };
}

