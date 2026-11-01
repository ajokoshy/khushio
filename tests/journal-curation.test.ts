import { describe, expect, it } from "vitest";
import { cleanComparison, cleanOccasion, dealSlug } from "../lib/curation-core";
import { ARTICLE_LIMITS, articleState, cleanArticle, cleanTags, deriveFromBody, istDate, parsePublishAt, toLocalInput } from "../lib/journal-core";
import { pgArray } from "../lib/data/journal";

describe("tags", () => {
  it("normalises, de-duplicates and bounds", () => { expect(cleanTags("Jute, Home decor, jute\n  Gifts ")).toEqual(["jute", "home-decor", "gifts"]); expect(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(","))).toHaveLength(ARTICLE_LIMITS.tags); expect(cleanTags(",, ,")).toEqual([]); expect(cleanTags("x".repeat(80))[0]).toHaveLength(ARTICLE_LIMITS.tagLength); });
});
describe("publish time (India time)", () => {
  it("reads datetime-local as IST", () => { expect(parsePublishAt("2026-12-31T09:30")?.toISOString()).toBe("2026-12-31T04:00:00.000Z"); expect(toLocalInput(parsePublishAt("2026-12-31T09:30"))).toBe("2026-12-31T09:30"); });
  it.each(["", "2026-12-31", "2026-13-40T10:00", "tomorrow", "2026-12-31T25:00"])("rejects %j", (v) => expect(parsePublishAt(v)).toBeNull());
  it("gives the India calendar date", () => expect(istDate(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01"));
  it("derives draft, scheduled and live", () => { const now = new Date("2026-11-01T00:00:00Z"); expect(articleState("draft", null, now)).toBe("draft"); expect(articleState("published", new Date("2026-12-01"), now)).toBe("scheduled"); expect(articleState("published", new Date("2026-10-01"), now)).toBe("live"); expect(articleState("published", null, now)).toBe("live"); expect(articleState("draft", new Date("2026-10-01"), now)).toBe("draft"); });
});
describe("article cleaning", () => {
  const ok = { title: " A  title ", slug: "", excerpt: "", body: "First paragraph here.\n\n[[product:jute]]\n\n![x](media:11111111-1111-1111-1111-111111111111)", author: "", seoTitle: "", seoDescription: "" };
  it("builds slug and excerpt, trims title", () => { const r = cleanArticle(ok); expect(r.ok && r.value).toMatchObject({ title: "A title", slug: "a-title", excerpt: "First paragraph here.", seoTitle: null }); });
  it("rejects empty and over-long input with a reason", () => { expect(cleanArticle({ ...ok, title: " " })).toEqual({ ok: false, error: "title" }); expect(cleanArticle({ ...ok, body: " " })).toEqual({ ok: false, error: "body" }); expect(cleanArticle({ ...ok, title: "x".repeat(200) })).toEqual({ ok: false, error: "title-long" }); expect(cleanArticle({ ...ok, body: "x".repeat(ARTICLE_LIMITS.body + 1) })).toEqual({ ok: false, error: "body-long" }); expect(cleanArticle({ ...ok, title: "!!!" })).toEqual({ ok: false, error: "slug" }); });
  it("derives products and media from the body at save time", () => { const d = deriveFromBody(ok.body); expect(d.productSlugs).toEqual(["jute"]); expect(d.mediaIds).toEqual(["11111111-1111-1111-1111-111111111111"]); expect(d.readMinutes).toBe(1); });
});
describe("pgArray", () => { it("accepts arrays and Postgres text form", () => { expect(pgArray(["a", "b"])).toEqual(["a", "b"]); expect(pgArray("{a,b}")).toEqual(["a", "b"]); expect(pgArray('{"a","b c"}')).toEqual(["a", "b c"]); expect(pgArray("{}")).toEqual([]); expect(pgArray(null)).toEqual([]); }); });

describe("gift occasions", () => {
  const base = { title: "Under 500", slug: "", intro: "", categories: "", min: "", max: "500", query: "", position: "0", enabled: true };
  it("accepts a price-only occasion and builds its address", () => expect(cleanOccasion(base)).toMatchObject({ ok: true, value: { slug: "under-500", maxPrice: 500, minPrice: null, categories: "" } }));
  it("cleans categories and rejects impossible ranges and empty searches", () => {
    expect(cleanOccasion({ ...base, max: "", categories: "Kids & Baby, home-living, kids-baby" })).toMatchObject({ ok: true, value: { categories: "kids-baby,home-living" } });
    expect(cleanOccasion({ ...base, min: "900", max: "500" })).toEqual({ ok: false, error: "price" }); expect(cleanOccasion({ ...base, max: "abc" })).toEqual({ ok: false, error: "price" }); expect(cleanOccasion({ ...base, max: "" })).toEqual({ ok: false, error: "empty" }); expect(cleanOccasion({ ...base, title: " " })).toEqual({ ok: false, error: "title" });
  });
});
describe("curated comparisons", () => {
  const base = { title: "A vs B", slug: "", intro: "", verdict: "", products: "a, b", status: "published" };
  it("needs between two and four distinct products", () => { expect(cleanComparison(base)).toMatchObject({ ok: true, value: { slug: "a-vs-b", productSlugs: ["a", "b"] } }); expect(cleanComparison({ ...base, products: "a" })).toEqual({ ok: false, error: "products" }); expect(cleanComparison({ ...base, products: "a, a" })).toEqual({ ok: false, error: "products" }); expect((cleanComparison({ ...base, products: "a,b,c,d,e,f" }) as { value: { productSlugs: string[] } }).value.productSlugs).toHaveLength(4); });
});
describe("deal addresses", () => {
  it("is readable, and adds a suffix only when taken", () => { expect(dealSlug("Big Sale!", () => false)).toBe("big-sale"); expect(dealSlug("Big Sale", (s) => s === "big-sale", () => "ab12")).toBe("big-sale-ab12"); expect(dealSlug("!!!", () => false)).toBe("deal"); });
  it("always terminates, even if everything looks taken", () => expect(dealSlug("x", () => true, () => "r")).toMatch(/^x-/));
});
