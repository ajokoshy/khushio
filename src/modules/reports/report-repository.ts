import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "@/core/database/client";
import { affiliateClickDaily, affiliateConversions, affiliateLinks, merchants, products } from "@/core/database/schema";
import type { ClickLinkRow, ClickMerchantRow, ClickProductRow, ConversionTotals, DayClicks, ZeroClickLink } from "./types";

/**
 * Report queries (Release 4B). They read the long-term daily table (human clicks only, bots are never rolled up),
 * so a report costs the same however many raw clicks exist. Days are IST calendar days given as "YYYY-MM-DD".
 */

const clicksSum = sql<number>`coalesce(sum(${affiliateClickDaily.clicks}), 0)::int`;
const inRange = (from: string, to: string) => and(gte(affiliateClickDaily.day, from), lte(affiliateClickDaily.day, to));

export async function selectClicksByDay(from: string, to: string): Promise<DayClicks[]> {
  const rows = await db()
    .select({ day: affiliateClickDaily.day, clicks: clicksSum })
    .from(affiliateClickDaily)
    .where(inRange(from, to))
    .groupBy(affiliateClickDaily.day)
    .orderBy(asc(affiliateClickDaily.day));
  return rows.map((r) => ({ day: r.day, clicks: Number(r.clicks) }));
}

export async function selectTopLinks(from: string, to: string, limit: number): Promise<ClickLinkRow[]> {
  const rows = await db()
    .select({ linkId: affiliateLinks.id, slug: affiliateLinks.slug, merchantName: merchants.name, productName: products.name, clicks: clicksSum })
    .from(affiliateClickDaily)
    .innerJoin(affiliateLinks, eq(affiliateLinks.id, affiliateClickDaily.linkId))
    .innerJoin(merchants, eq(merchants.id, affiliateLinks.merchantId))
    .leftJoin(products, eq(products.id, affiliateLinks.productId))
    .where(inRange(from, to))
    .groupBy(affiliateLinks.id, affiliateLinks.slug, merchants.name, products.name)
    .orderBy(desc(clicksSum), asc(affiliateLinks.slug))
    .limit(limit);
  return rows.map((r) => ({ ...r, clicks: Number(r.clicks) }));
}

export async function selectClicksByMerchant(from: string, to: string, limit: number): Promise<ClickMerchantRow[]> {
  const rows = await db()
    .select({ merchantId: merchants.id, merchantName: merchants.name, clicks: clicksSum })
    .from(affiliateClickDaily)
    .innerJoin(affiliateLinks, eq(affiliateLinks.id, affiliateClickDaily.linkId))
    .innerJoin(merchants, eq(merchants.id, affiliateLinks.merchantId))
    .where(inRange(from, to))
    .groupBy(merchants.id, merchants.name)
    .orderBy(desc(clicksSum), asc(merchants.name))
    .limit(limit);
  return rows.map((r) => ({ ...r, clicks: Number(r.clicks) }));
}

export async function selectClicksByProduct(from: string, to: string, limit: number): Promise<ClickProductRow[]> {
  const rows = await db()
    .select({ productId: products.id, productName: products.name, productSlug: products.slug, clicks: clicksSum })
    .from(affiliateClickDaily)
    .innerJoin(affiliateLinks, eq(affiliateLinks.id, affiliateClickDaily.linkId))
    .innerJoin(products, eq(products.id, affiliateLinks.productId))
    .where(inRange(from, to))
    .groupBy(products.id, products.name, products.slug)
    .orderBy(desc(clicksSum), asc(products.name))
    .limit(limit);
  return rows.map((r) => ({ ...r, clicks: Number(r.clicks) }));
}

/**
 * Active links (of active merchants) with no human click in the window and created before `createdBefore`, so a link
 * made today is not reported before it has had a full day.
 */
export async function selectZeroClickLinks(from: string, to: string, createdBefore: Date, limit: number): Promise<ZeroClickLink[]> {
  return db()
    .select({ linkId: affiliateLinks.id, slug: affiliateLinks.slug, merchantName: merchants.name, productName: products.name, createdAt: affiliateLinks.createdAt })
    .from(affiliateLinks)
    .innerJoin(merchants, eq(merchants.id, affiliateLinks.merchantId))
    .leftJoin(products, eq(products.id, affiliateLinks.productId))
    .where(
      and(
        eq(affiliateLinks.isActive, true),
        eq(merchants.isActive, true),
        lt(affiliateLinks.createdAt, createdBefore),
        sql`not exists (select 1 from ${affiliateClickDaily} where ${affiliateClickDaily.linkId} = ${affiliateLinks.id} and ${affiliateClickDaily.day} >= ${from} and ${affiliateClickDaily.day} <= ${to} and ${affiliateClickDaily.clicks} > 0)`,
      ),
    )
    .orderBy(asc(affiliateLinks.createdAt), asc(affiliateLinks.id))
    .limit(limit);
}

/** Conversions whose date falls in [from, to). Uses conv_converted_at_idx. */
export async function selectConversionTotals(from: Date, to: Date): Promise<ConversionTotals[]> {
  const rows = await db()
    .select({
      status: affiliateConversions.status,
      currency: affiliateConversions.currency,
      orders: sql<number>`count(*)::int`,
      commissionMinor: sql<number>`coalesce(sum(${affiliateConversions.commissionMinor}), 0)::bigint`,
    })
    .from(affiliateConversions)
    .where(and(gte(affiliateConversions.convertedAt, from), lt(affiliateConversions.convertedAt, to)))
    .groupBy(affiliateConversions.status, affiliateConversions.currency)
    .orderBy(asc(affiliateConversions.currency), asc(affiliateConversions.status));
  return rows.map((r) => ({ status: r.status, currency: r.currency.trim(), orders: Number(r.orders), commissionMinor: Number(r.commissionMinor) }));
}
