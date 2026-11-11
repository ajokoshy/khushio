import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/core/database/client";
import { affiliateClicks, affiliateLinks, products } from "@/core/database/schema";

export async function countProducts(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(products);
  return Number(row?.n ?? 0);
}

export async function countAffiliateLinks(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(affiliateLinks);
  return Number(row?.n ?? 0);
}

/** Uses clicks_time_idx (clicked_at). Bots are excluded from the headline number. */
export async function countClicksSince(since: Date): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(affiliateClicks)
    .where(and(gte(affiliateClicks.clickedAt, since), eq(affiliateClicks.isBot, false)));
  return Number(row?.n ?? 0);
}
