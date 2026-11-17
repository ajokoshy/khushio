import { describe, expect, it } from "vitest";
import { basisPointsToInput, describeDiscount, describeMinSpend, discountValueToInput, parseDiscountValue, parsePercentToBasisPoints } from "@/modules/deals/discount";
import { couponInputSchema, dealInputSchema, parseSlugList } from "@/modules/deals/validation";

const MERCHANT = "11111111-1111-4111-8111-111111111111";

describe("percent discounts", () => {
  it("are stored as basis points", () => {
    expect(parsePercentToBasisPoints("15")).toEqual({ ok: true, value: 1500 });
    expect(parsePercentToBasisPoints("12.5%")).toEqual({ ok: true, value: 1250 });
    expect(parsePercentToBasisPoints("0.25")).toEqual({ ok: true, value: 25 });
    expect(parsePercentToBasisPoints("100")).toEqual({ ok: true, value: 10000 });
  });
  it("refuse zero, more than 100, three decimals and words", () => {
    for (const bad of ["0", "100.01", "101", "1.234", "ten", "", "-5"]) expect(parsePercentToBasisPoints(bad).ok, bad).toBe(false);
  });
  it("round trip to the text an admin typed", () => {
    for (const v of ["15", "12.5", "0.25", "99.99"]) expect(basisPointsToInput((parsePercentToBasisPoints(v) as { value: number }).value)).toBe(v);
  });
});

describe("discount values by type", () => {
  it("reads a fixed amount in minor units and ignores the value for free shipping", () => {
    expect(parseDiscountValue("fixed", "200", "INR")).toEqual({ ok: true, value: 20000 });
    expect(parseDiscountValue("fixed", "1,299.50", "INR")).toEqual({ ok: true, value: 129950 });
    expect(parseDiscountValue("fixed", "", "INR").ok).toBe(false);
    expect(parseDiscountValue("free_shipping", "whatever", "INR")).toEqual({ ok: true, value: 0 });
    expect(parseDiscountValue("other", "", "INR")).toEqual({ ok: true, value: 0 });
  });
  it("describes them for visitors and the form", () => {
    expect(describeDiscount("percent", 1500, "INR")).toBe("15% off");
    expect(describeDiscount("free_shipping", 0, "INR")).toBe("Free shipping");
    expect(describeDiscount("other", 0, "INR")).toBe("");
    expect(describeMinSpend(null, "INR")).toBe("");
    expect(describeMinSpend(99900, "INR")).toContain("999");
    expect(discountValueToInput("percent", 1250, "INR")).toBe("12.5");
    expect(discountValueToInput("fixed", 20000, "INR")).toBe("200");
    expect(discountValueToInput("free_shipping", 0, "INR")).toBe("");
  });
});

describe("slug lists", () => {
  it("split on commas, lines and semicolons, lower-case and drop repeats", () => {
    expect(parseSlugList("A-b, c-d\nc-d;e", 10, "product")).toEqual({ ok: true, value: ["a-b", "c-d", "e"] });
    expect(parseSlugList("", 10, "product")).toEqual({ ok: true, value: [] });
  });
  it("refuse text that is not a slug and lists that are too long", () => {
    expect(parseSlugList("fine, Not A Slug!", 10, "product").ok).toBe(false);
    expect(parseSlugList("a,b,c", 2, "product").ok).toBe(false);
  });
});

describe("deal form", () => {
  const form = { title: "20% off", merchantId: MERCHANT, type: "deal", status: "draft" };
  it("accepts the minimum and defaults the rest", () => {
    const r = dealInputSchema.safeParse(form);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ startsAt: null, endsAt: null, isFeatured: false, sortOrder: 0, productSlugs: [], categorySlugs: [], affiliateLinkSlug: null });
  });
  it("reads dates as India time", () => {
    const r = dealInputSchema.parse({ ...form, startsAt: "2026-12-01T09:30", endsAt: "2026-12-02T09:30" });
    expect(r.startsAt?.toISOString()).toBe("2026-12-01T04:00:00.000Z");
  });
  it("refuses an end that is not after the start, a bad date, an unknown type", () => {
    expect(dealInputSchema.safeParse({ ...form, startsAt: "2026-12-02T09:30", endsAt: "2026-12-02T09:30" }).success).toBe(false);
    expect(dealInputSchema.safeParse({ ...form, startsAt: "2026-02-31T09:30" }).success).toBe(false);
    expect(dealInputSchema.safeParse({ ...form, type: "bogus" }).success).toBe(false);
    expect(dealInputSchema.safeParse({ ...form, title: "  " }).success).toBe(false);
  });
});

describe("coupon form", () => {
  const form = { merchantId: MERCHANT, code: "SAVE15", discountType: "percent", discountValue: "15", currency: "INR" };
  it("turns the typed value into the stored number", () => {
    const r = couponInputSchema.safeParse(form);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ code: "SAVE15", discountValue: 1500, minSpendMinor: null, dealSlug: null, isActive: false });
  });
  it("refuses codes with spaces, missing values and a minimum spend that is not an amount", () => {
    expect(couponInputSchema.safeParse({ ...form, code: "SAVE 15" }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...form, discountValue: "" }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...form, minSpend: "lots" }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...form, startsAt: "2026-12-02T09:30", endsAt: "2026-12-01T09:30" }).success).toBe(false);
  });
});
