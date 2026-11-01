import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { findDuplicateMatches, urlKey, type DupMatch } from "@/lib/duplicates";

const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
/** Existing products that look like the one being created: same name, same slug, or an affiliate link to the same page. */
export async function findDuplicates(input: { name: string; slug: string; urls: string[]; excludeId?: string }): Promise<DupMatch[]> {
  if (!db) return [];
  const keys = [...new Set(input.urls.map(urlKey).filter((k) => k.includes("/") || k.includes(".")))];
  const byLink = keys.length ? await db.select({ id: schema.offers.productId }).from(schema.offers).where(or(...keys.map((k) => ilike(schema.offers.url, like(k))))!) : [];
  const rows = await db.select({ id: schema.products.id, slug: schema.products.slug, name: schema.products.name }).from(schema.products)
    .where(or(eq(schema.products.slug, input.slug), sql`lower(${schema.products.name}) = lower(${input.name})`, byLink.length ? inArray(schema.products.id, byLink.map((b) => b.id)) : undefined)!).limit(25);
  if (!rows.length) return [];
  const offs = await db.select({ productId: schema.offers.productId, url: schema.offers.url }).from(schema.offers).where(inArray(schema.offers.productId, rows.map((r) => r.id)));
  return findDuplicateMatches(input, rows.map((r) => ({ ...r, urls: offs.filter((o) => o.productId === r.id).map((o) => o.url) })));
}
