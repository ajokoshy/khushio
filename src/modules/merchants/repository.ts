import { and, asc, count, eq, ilike, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { affiliateLinks, merchantPrograms, merchants } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import type { MerchantRow, MerchantWrite, StatusFilter } from "./types";

/** Repository: the only code in this module that talks to the database. */

const columns = {
  id: merchants.id,
  slug: merchants.slug,
  name: merchants.name,
  websiteUrl: merchants.websiteUrl,
  allowedDomains: merchants.allowedDomains,
  logoUrl: merchants.logoUrl,
  isActive: merchants.isActive,
};

function filters(q: string | undefined, status: StatusFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(or(ilike(merchants.name, pattern), ilike(merchants.slug, pattern)));
  }
  if (status === "active") conditions.push(eq(merchants.isActive, true));
  if (status === "archived") conditions.push(eq(merchants.isActive, false));
  return and(...conditions);
}

export async function selectMerchants(opts: { q?: string; status: StatusFilter; limit: number; offset: number }): Promise<MerchantRow[]> {
  return db()
    .select(columns)
    .from(merchants)
    .where(filters(opts.q, opts.status))
    .orderBy(asc(sql`lower(${merchants.name})`), asc(merchants.id))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function selectMerchantById(id: string): Promise<MerchantRow | null> {
  const [row] = await db().select(columns).from(merchants).where(eq(merchants.id, id)).limit(1);
  return row ?? null;
}

export async function selectMerchantSlugsLike(base: string): Promise<string[]> {
  const rows = await db()
    .select({ slug: merchants.slug })
    .from(merchants)
    .where(or(eq(merchants.slug, base), like(merchants.slug, `${escapeLike(base)}-%`)));
  return rows.map((r) => r.slug);
}

export async function selectMerchantByName(name: string): Promise<MerchantRow | null> {
  const [row] = await db().select(columns).from(merchants).where(sql`lower(${merchants.name}) = lower(${name})`).limit(1);
  return row ?? null;
}

export async function insertMerchant(values: MerchantWrite): Promise<MerchantRow> {
  const [row] = await db().insert(merchants).values(values).returning(columns);
  if (!row) throw new Error("Merchant insert returned no row");
  return row;
}

export async function updateMerchantRow(id: string, values: Partial<MerchantWrite> & { isActive?: boolean }): Promise<MerchantRow | null> {
  const [row] = await db().update(merchants).set(values).where(eq(merchants.id, id)).returning(columns);
  return row ?? null;
}

export async function deleteMerchantRow(id: string): Promise<void> {
  await db().delete(merchants).where(eq(merchants.id, id));
}

/** Uses links_merchant_idx. */
export async function countAffiliateLinksForMerchant(id: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(affiliateLinks).where(eq(affiliateLinks.merchantId, id));
  return Number(row?.n ?? 0);
}

/** Uses programs_merchant_idx. */
export async function countProgramsForMerchant(id: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(merchantPrograms).where(eq(merchantPrograms.merchantId, id));
  return Number(row?.n ?? 0);
}
