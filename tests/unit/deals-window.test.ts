import { describe, expect, it } from "vitest";
import { dealState, isCouponLive, isDealLive, isWindowOpen, liveDeals, onlyLive, START_LOOKAHEAD_MS } from "@/modules/deals/window";
import type { PublicDeal } from "@/modules/deals/types";
import { CACHE_TTL } from "@/core/config/cache";

const T = new Date("2026-11-20T10:00:00.000Z");
const at = (ms: number) => new Date(T.getTime() + ms);

describe("the offer window (boundaries to the millisecond)", () => {
  it("is live from exactly starts_at", () => {
    expect(isWindowOpen(at(0), null, T)).toBe(true);
    expect(isWindowOpen(at(1), null, T)).toBe(false);
  });

  it("is over at exactly ends_at: an offer that ends now is already gone", () => {
    expect(isWindowOpen(at(-1000), at(1), T)).toBe(true);
    expect(isWindowOpen(at(-1000), at(0), T)).toBe(false);
    expect(isWindowOpen(at(-1000), at(-1), T)).toBe(false);
  });

  it("treats no end date as open-ended, and an unreadable date as closed", () => {
    expect(isWindowOpen(at(-1), null, T)).toBe(true);
    expect(isWindowOpen(at(-1), undefined, T)).toBe(true);
    expect(isWindowOpen("not a date", null, T)).toBe(false);
    expect(isWindowOpen(at(-1), "not a date", T)).toBe(false);
  });

  it("reads ISO strings the way cached (JSON) rows carry them", () => {
    expect(isWindowOpen("2026-11-20T09:00:00.000Z", "2026-11-20T10:00:00.001Z", T)).toBe(true);
    expect(isWindowOpen("2026-11-20T09:00:00.000Z", "2026-11-20T10:00:00.000Z", T)).toBe(false);
  });
});

describe("deal and coupon liveness", () => {
  const base = { startsAt: at(-1000), endsAt: at(1000) };
  it("needs the published status as well as the dates", () => {
    expect(isDealLive({ ...base, status: "published" }, T)).toBe(true);
    expect(isDealLive({ ...base, status: "draft" }, T)).toBe(false);
    expect(isDealLive({ ...base, status: "archived" }, T)).toBe(false);
  });
  it("needs a coupon to be active", () => {
    expect(isCouponLive({ ...base, isActive: true }, T)).toBe(true);
    expect(isCouponLive({ ...base, isActive: false }, T)).toBe(false);
  });
});

describe("dealState", () => {
  it("names what an offer is doing now", () => {
    expect(dealState({ status: "draft", startsAt: at(-1), endsAt: null }, T)).toBe("draft");
    expect(dealState({ status: "archived", startsAt: at(-1), endsAt: null }, T)).toBe("archived");
    expect(dealState({ status: "published", startsAt: at(1), endsAt: null }, T)).toBe("scheduled");
    expect(dealState({ status: "published", startsAt: at(0), endsAt: null }, T)).toBe("live");
    expect(dealState({ status: "published", startsAt: at(-5), endsAt: at(1) }, T)).toBe("live");
    expect(dealState({ status: "published", startsAt: at(-5), endsAt: at(0) }, T)).toBe("expired");
  });
});

describe("a stale cached list can never show an ended offer", () => {
  const deal = (slug: string, startsAt: Date, endsAt: Date | null, coupons: PublicDeal["coupons"] = []): PublicDeal => ({
    id: slug, slug, title: slug, type: "deal", description: null, merchantName: "S", merchantSlug: "s", linkSlug: null,
    startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null, isFeatured: false, scope: "store", coupons,
  });
  const coupon = (id: string, endsAt: Date | null) => ({ id, code: id, discountType: "percent", discountValue: 1000, currency: "INR", minSpendMinor: null, startsAt: at(-9999).toISOString(), endsAt: endsAt?.toISOString() ?? null });

  it("drops ended offers and not-yet-started offers, and keeps the rest in order", () => {
    const cached = [deal("ended", at(-9000), at(0)), deal("running", at(-9000), at(5000)), deal("later", at(1), at(9000)), deal("open", at(-1), null)];
    expect(liveDeals(cached, T).map((d) => d.slug)).toEqual(["running", "open"]);
    // the same list a little later: "running" has ended, "later" has started
    expect(liveDeals(cached, at(6000)).map((d) => d.slug)).toEqual(["later", "open"]);
  });

  it("drops an ended coupon but keeps its deal", () => {
    const cached = [deal("d", at(-9000), null, [coupon("old", at(-1)), coupon("new", at(1000))])];
    expect(liveDeals(cached, T)[0]?.coupons.map((c) => c.id)).toEqual(["new"]);
  });

  it("onlyLive keeps the input order", () => {
    expect(onlyLive([{ startsAt: at(-1), endsAt: null, n: 1 }, { startsAt: at(-1), endsAt: at(-1), n: 2 }, { startsAt: at(-1), endsAt: null, n: 3 }], T).map((r) => r.n)).toEqual([1, 3]);
  });
});

describe("cache settings", () => {
  it("the cache time is shorter than the start look-ahead, so a list never misses an offer that starts between refreshes", () => {
    expect(CACHE_TTL.deals * 1000).toBeLessThan(START_LOOKAHEAD_MS);
    expect(CACHE_TTL.deals).toBeGreaterThanOrEqual(5 * 60);
    expect(CACHE_TTL.deals).toBeLessThanOrEqual(15 * 60);
  });
});
