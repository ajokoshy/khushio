import { describe, expect, it } from "vitest";
import { categories } from "../lib/config/site";
import { articles, brands, catLabel, coupons, deals, findOffer, findOfferAsync, inr, loadArticles, loadBrands, loadCategories, loadCollections, loadCoupons, loadDeals, loadProducts, products } from "../lib/data/catalog";
describe("sample data integrity", () => {
  it("has unique product slugs", () => expect(new Set(products.map((p) => p.slug)).size).toBe(products.length));
  it("has unique offer ids", () => { const ids = products.flatMap((p) => p.offers.map((o) => o.id)); expect(new Set(ids).size).toBe(ids.length); });
  it("uses known categories and brands", () => { for (const p of products) { expect(categories.some((c) => c.slug === p.category)).toBe(true); expect(brands.some((b) => b.slug === p.brand)).toBe(true); } });
  it("has https offers and sensible prices", () => { for (const p of products) { expect(p.price).toBeGreaterThan(0); if (p.mrp) expect(p.mrp).toBeGreaterThan(p.price); for (const o of p.offers) expect(o.url.startsWith("https://")).toBe(true); } });
  it("has deals and coupons that point at real offers", () => { for (const x of [...deals, ...coupons]) expect(findOffer(x.offerId)).toBeDefined(); });
  it("has unique article slugs with body text", () => { expect(new Set(articles.map((a) => a.slug)).size).toBe(articles.length); for (const a of articles) expect(a.body.length).toBeGreaterThan(0); });
});
describe("helpers", () => {
  it("formats rupees with Indian grouping", () => { expect(inr(1799)).toBe("₹1,799"); expect(inr(123456)).toBe("₹1,23,456"); });
  it("labels categories and falls back to the slug", () => { expect(catLabel("home-living")).toBe("Home & Living"); expect(catLabel("mystery")).toBe("mystery"); });
  it("finds offers by id", async () => { expect(findOffer("o2")?.url).toBe("https://example.com/p/2"); expect(findOffer("zzz")).toBeUndefined(); expect(await findOfferAsync("o3")).toBeDefined(); });
  it("returns undefined for unknown ids without a database", async () => { expect(await findOfferAsync("nope")).toBeUndefined(); expect(await findOfferAsync("00000000-0000-0000-0000-000000000000")).toBeUndefined(); });
});
describe("loaders fall back to samples without a database", () => {
  it("products", async () => expect(await loadProducts()).toEqual(products));
  it("brands", async () => expect(await loadBrands()).toEqual(brands));
  it("categories", async () => expect((await loadCategories()).map((c) => c.slug)).toEqual(categories.map((c) => c.slug)));
  it("deals, coupons and articles", async () => { expect(await loadDeals()).toEqual(deals); expect(await loadCoupons()).toEqual(coupons); expect(await loadArticles()).toEqual(articles); });
  it("collections are empty", async () => expect(await loadCollections()).toEqual([]));
});
