/**
 * The one rule for "is an offer showing right now" (Release 5A), as plain functions so it can be tested to the
 * millisecond. The SQL version of the same rule is in conditions.ts and every public query uses it.
 *
 *   starts_at <= now   -> started (an offer that starts exactly now is live)
 *   ends_at   >  now   -> not ended (an offer that ends exactly now is already over)
 *   ends_at is null    -> no end date
 *
 * A deal also needs status "published". Nothing flips a flag when it ends: the clock alone decides.
 */
import type { DealState, PublicDeal } from "./types";

type When = Date | string | number | null | undefined;

const ms = (value: When): number | null => {
  if (value === null || value === undefined) return null;
  const t = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isNaN(t) ? null : t;
};

/** True while `now` is inside [startsAt, endsAt). An unreadable start time counts as "not started". */
export function isWindowOpen(startsAt: When, endsAt: When, now: Date = new Date()): boolean {
  const start = ms(startsAt);
  if (start === null || start > now.getTime()) return false;
  const end = ms(endsAt);
  return end === null ? endsAt === null || endsAt === undefined : end > now.getTime();
}

export function isDealLive(deal: { status: string; startsAt: When; endsAt: When }, now: Date = new Date()): boolean {
  return deal.status === "published" && isWindowOpen(deal.startsAt, deal.endsAt, now);
}

export function isCouponLive(coupon: { isActive: boolean; startsAt: When; endsAt: When }, now: Date = new Date()): boolean {
  return coupon.isActive && isWindowOpen(coupon.startsAt, coupon.endsAt, now);
}

/** draft and archived come from the status; for a published deal the dates decide between scheduled, live and expired. */
export function dealState(deal: { status: string; startsAt: When; endsAt: When }, now: Date = new Date()): DealState {
  if (deal.status === "draft") return "draft";
  if (deal.status === "archived") return "archived";
  const start = ms(deal.startsAt);
  if (start === null || start > now.getTime()) return "scheduled";
  const end = ms(deal.endsAt);
  if (end !== null && end <= now.getTime()) return "expired";
  return "live";
}

/** Keeps only what is live at `now`. Used on cached lists, so a stale cache can never show an ended offer. */
export function onlyLive<T extends { startsAt: When; endsAt: When }>(rows: readonly T[], now: Date = new Date()): T[] {
  return rows.filter((r) => isWindowOpen(r.startsAt, r.endsAt, now));
}

/**
 * Cached lists include offers that start within this long, so one that starts between two cache refreshes is already
 * in the list and is shown by the clock check. Must be at least the cache time (CACHE_TTL.deals).
 */
export const START_LOOKAHEAD_MS = 15 * 60 * 1000;

/** The deals in a cached list that are live at `now`, each with only its live coupons. */
export function liveDeals(deals: readonly PublicDeal[], now: Date): PublicDeal[] {
  return onlyLive(deals, now).map((d) => ({ ...d, coupons: onlyLive(d.coupons, now) }));
}
