import { sql, type SQL } from "drizzle-orm";
import { coupons, deals } from "@/core/database/schema";
import { START_LOOKAHEAD_MS } from "./window";

/**
 * The SQL twin of window.ts (Release 5A), evaluated with the database clock. Every public deal query uses one of
 * these, so an offer whose end time has passed is never selected, whatever any cache holds.
 */

/** Postgres interval literal built from a constant (never from input), for "starts within the look-ahead". */
const LOOKAHEAD = sql.raw(`interval '${Math.round(START_LOOKAHEAD_MS / 60_000)} minutes'`);

/** Live right now. */
export const liveDealCondition = (): SQL =>
  sql`(${deals.status} = 'published' AND ${deals.startsAt} <= now() AND (${deals.endsAt} IS NULL OR ${deals.endsAt} > now()))`;

export const liveCouponCondition = (): SQL =>
  sql`(${coupons.isActive} AND ${coupons.startsAt} <= now() AND (${coupons.endsAt} IS NULL OR ${coupons.endsAt} > now()))`;

/** Live now, or starting within the look-ahead. Used by cached public lists, which are filtered again with the clock at render time. */
export const liveOrSoonDealCondition = (): SQL =>
  sql`(${deals.status} = 'published' AND ${deals.startsAt} <= now() + ${LOOKAHEAD} AND (${deals.endsAt} IS NULL OR ${deals.endsAt} > now()))`;

export const liveOrSoonCouponCondition = (): SQL =>
  sql`(${coupons.isActive} AND ${coupons.startsAt} <= now() + ${LOOKAHEAD} AND (${coupons.endsAt} IS NULL OR ${coupons.endsAt} > now()))`;

export const scheduledDealCondition = (): SQL => sql`(${deals.status} = 'published' AND ${deals.startsAt} > now())`;
export const expiredDealCondition = (): SQL => sql`(${deals.status} = 'published' AND ${deals.startsAt} <= now() AND ${deals.endsAt} IS NOT NULL AND ${deals.endsAt} <= now())`;
