import { and, eq, gte, lt, min, sql } from "drizzle-orm";
import { db } from "@/core/database/client";
import { affiliateClicks } from "@/core/database/schema";

/**
 * Roll-up and purge queries (Release 4B). Both are single statements, so each is all-or-nothing on its own.
 */

/** Oldest raw click, or null when there are none. Uses clicks_time_idx. */
export async function selectOldestClickAt(): Promise<Date | null> {
  const [row] = await db().select({ at: min(affiliateClicks.clickedAt) }).from(affiliateClicks);
  return row?.at ?? null;
}

/**
 * Counts human (non-bot) clicks per link and IST day for [from, to) and upserts them into affiliate_click_daily.
 * GREATEST makes a second run harmless (same numbers) and makes it impossible for a later run to LOWER a total, for
 * example when part of that day's raw clicks were already purged. Returns the number of link-days written.
 */
export async function upsertDailyClicks(from: Date, to: Date): Promise<number> {
  const result = await db().execute(sql`
    WITH written AS (
      INSERT INTO affiliate_click_daily (link_id, day, clicks)
      SELECT link_id, (clicked_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*)::int AS clicks
      FROM affiliate_clicks
      WHERE clicked_at >= ${from.toISOString()}::timestamptz AND clicked_at < ${to.toISOString()}::timestamptz AND is_bot = false
      GROUP BY link_id, (clicked_at AT TIME ZONE 'Asia/Kolkata')::date
      ON CONFLICT (link_id, day) DO UPDATE SET clicks = GREATEST(affiliate_click_daily.clicks, EXCLUDED.clicks)
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM written
  `);
  return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

/** Deletes raw clicks (bots included) older than the cutoff. Returns how many. */
export async function deleteClicksBefore(cutoff: Date): Promise<number> {
  const result = await db().execute(sql`
    WITH removed AS (
      DELETE FROM affiliate_clicks WHERE clicked_at < ${cutoff.toISOString()}::timestamptz RETURNING 1
    )
    SELECT count(*)::int AS n FROM removed
  `);
  return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export async function countHumanClicksSince(since: Date): Promise<number> {
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(affiliateClicks)
    .where(and(gte(affiliateClicks.clickedAt, since), eq(affiliateClicks.isBot, false)));
  return Number(rows[0]?.n ?? 0);
}

export async function countRawClicksBefore(cutoff: Date): Promise<number> {
  const rows = await db().select({ n: sql<number>`count(*)::int` }).from(affiliateClicks).where(lt(affiliateClicks.clickedAt, cutoff));
  return Number(rows[0]?.n ?? 0);
}
