import { describe, expect, it } from "vitest";
import { findDuplicateMatches, normalizeName, urlKey } from "../lib/duplicates";
import { normalizePath, planRedirect } from "../lib/redirects";
import { normalizeSearch, pageCount, pageWindow, searchInMemory, toTsQuery } from "../lib/search-core";
import { productJsonLd, VERIFIED_PRICE_DAYS } from "../lib/seo/product";

describe("toTsQuery", () => {
  it("builds a prefix query from words", () => expect(toTsQuery("Jute bas")).toBe("jute:* & bas:*"));
  it.each([["'; drop table products; --", "drop:* & table:* & products:*"], ["a | b & !c <-> d", "a:* & b:* & c:* & d:*"], ["   ", null], ["", null], [undefined, null], ["!!!", null]])("is safe for %j", (q, out) => expect(toTsQuery(q as string)).toBe(out));
  it("keeps non-English letters and caps length and term count", () => { expect(toTsQuery("कुर्ता cotton")).toBe("कुर्ता:* & cotton:*"); expect(toTsQuery("a b c d e f g h i j k")?.split(" & ")).toHaveLength(8); expect(toTsQuery("x".repeat(100))).toBe(`${"x".repeat(40)}:*`); });
});

describe("normalizeSearch", () => {
  it("applies safe defaults", () => expect(normalizeSearch({})).toMatchObject({ page: 1, pageSize: 12, sort: "featured" }));
  it("uses relevance when searching and falls back when there is no query", () => { expect(normalizeSearch({ q: "Jute" })).toMatchObject({ q: "jute", sort: "relevance" }); expect(normalizeSearch({ sort: "relevance" }).sort).toBe("featured"); });
  it("rejects unknown sorts and clamps pages", () => { expect(normalizeSearch({ sort: "drop table" }).sort).toBe("featured"); expect(normalizeSearch({ page: "-4" }).page).toBe(1); expect(normalizeSearch({ page: "99999" }).page).toBe(500); expect(normalizeSearch({ page: "abc" }).page).toBe(1); });
  it("drops an impossible price range and bounds page size", () => { expect(normalizeSearch({ min: "500", max: "100" }).max).toBeUndefined(); expect(normalizeSearch({ pageSize: 9999 }).pageSize).toBe(48); });
  it("limits query length", () => expect(normalizeSearch({ q: "x".repeat(300) }).q).toHaveLength(80));
});

describe("pagination", () => {
  it("counts pages", () => { expect(pageCount(0, 12)).toBe(1); expect(pageCount(12, 12)).toBe(1); expect(pageCount(13, 12)).toBe(2); });
  it("builds a compact window", () => { expect(pageWindow(1, 1)).toEqual([1]); expect(pageWindow(1, 5)).toEqual([1, 2, "…", 5]); expect(pageWindow(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]); expect(pageWindow(3, 4)).toEqual([1, 2, 3, 4]); });
});

const item = (slug: string, o: object = {}) => ({ slug, name: slug, brand: "b", category: "c1", blurb: "", price: 100, offers: [{ merchant: "Shop A" }], ...o });
describe("searchInMemory", () => {
  const all = [item("jute-basket", { price: 300, brand: "greenleaf", mrp: 600 }), item("steel-bottle", { price: 900, category: "c2" }), item("jute-rug", { price: 1200, offers: [{ merchant: "Other Store" }] })];
  const run = (raw: object) => searchInMemory(all, normalizeSearch(raw));
  it("matches word prefixes, all terms required", () => { expect(run({ q: "jut" }).items.map((x) => x.slug)).toEqual(["jute-basket", "jute-rug"]); expect(run({ q: "jute rug" }).items).toHaveLength(1); expect(run({ q: "nothing" }).total).toBe(0); });
  it("filters by category, brand, merchant and price", () => { expect(run({ cat: "c2" }).items).toHaveLength(1); expect(run({ brand: "greenleaf" }).items).toHaveLength(1); expect(run({ merchant: "other-store" }).items.map((x) => x.slug)).toEqual(["jute-rug"]); expect(run({ min: 400, max: 1000 }).items.map((x) => x.slug)).toEqual(["steel-bottle"]); });
  it("sorts and paginates", () => { expect(run({ sort: "price-desc" }).items[0].slug).toBe("jute-rug"); expect(run({ sort: "saving" }).items[0].slug).toBe("jute-basket"); const r = run({ pageSize: 2, page: 2 }); expect(r).toMatchObject({ total: 3, pages: 2, page: 2 }); expect(r.items).toHaveLength(1); expect(run({ page: 50, pageSize: 2 }).page).toBe(2); });
});

describe("redirect planning", () => {
  it("normalises paths and rejects external or odd ones", () => { expect(normalizePath("/Products/x/?a=1#h")).toBe("/Products/x"); expect(normalizePath("/")).toBe("/"); for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "products/x", "/a b", "/a\\b", ""]) expect(normalizePath(bad), bad).toBeNull(); });
  it("refuses reserved, identical and invalid paths", () => { expect(planRedirect([], "/admin/x", "/y")).toEqual({ ok: false, reason: "reserved" }); expect(planRedirect([], "/x", "/go/1")).toEqual({ ok: false, reason: "reserved" }); expect(planRedirect([], "/x", "/x/")).toEqual({ ok: false, reason: "same" }); expect(planRedirect([], "x", "/y")).toEqual({ ok: false, reason: "invalid" }); });
  it("keeps redirects single-hop by re-pointing earlier ones", () => { const p = planRedirect([{ fromPath: "/products/a", toPath: "/products/b" }], "/products/b", "/products/c"); expect(p).toEqual({ ok: true, from: "/products/b", to: "/products/c", repoint: ["/products/a"], remove: [] }); });
  it("reverting a slug removes the old redirect instead of looping", () => { const p = planRedirect([{ fromPath: "/products/a", toPath: "/products/b" }], "/products/b", "/products/a"); expect(p).toEqual({ ok: true, from: "/products/b", to: "/products/a", repoint: [], remove: ["/products/a"] }); });
});

describe("duplicate detection", () => {
  const cands = [{ id: "1", slug: "jute-basket", name: "Jute  Basket!", urls: ["https://www.shop.example/p/1/?utm=a"] }, { id: "2", slug: "other", name: "Other", urls: ["https://shop.example/p/2"] }];
  it("normalises names and links", () => { expect(normalizeName("  Jute—Basket (3) ")).toBe("jute basket 3"); expect(urlKey("https://WWW.Shop.example/p/1/?a=1#x")).toBe("shop.example/p/1"); });
  it("finds a duplicate by name, slug or link and says why", () => {
    expect(findDuplicateMatches({ name: "jute basket", slug: "new", urls: [] }, cands)).toEqual([{ id: "1", slug: "jute-basket", name: "Jute  Basket!", reasons: ["name"] }]);
    expect(findDuplicateMatches({ name: "Different", slug: "different", urls: ["https://shop.example/p/2?ref=z"] }, cands)[0]).toMatchObject({ id: "2", reasons: ["link"] });
    expect(findDuplicateMatches({ name: "Different", slug: "other", urls: [] }, cands)[0].reasons).toEqual(["slug"]);
  });
  it("ignores the product being edited and reports nothing for unrelated products", () => { expect(findDuplicateMatches({ name: "Jute Basket", slug: "jute-basket", urls: [], excludeId: "1" }, cands)).toEqual([]); expect(findDuplicateMatches({ name: "Zzz", slug: "zzz", urls: ["https://x.example"] }, cands)).toEqual([]); });
});

describe("product structured data", () => {
  const now = new Date("2026-11-01T00:00:00Z"), day = 86_400_000;
  const base = { slug: "p", name: "P", blurb: "b", offers: [] as { merchant: string; price?: number; checkedAt?: string }[] };
  it("asserts no price when nothing is verified", () => { expect(productJsonLd(base, undefined, now).offers).toBeUndefined(); expect(productJsonLd({ ...base, offers: [{ merchant: "A", price: 10 }] }, undefined, now).offers).toBeUndefined(); });
  it("includes only prices verified recently", () => {
    const ld = productJsonLd({ ...base, offers: [{ merchant: "Fresh", price: 10, checkedAt: new Date(+now - 2 * day).toISOString() }, { merchant: "Stale", price: 20, checkedAt: new Date(+now - (VERIFIED_PRICE_DAYS + 1) * day).toISOString() }, { merchant: "NoPrice", checkedAt: now.toISOString() }] }, "Brand", now);
    expect(ld.offers).toEqual([{ "@type": "Offer", price: 10, priceCurrency: "INR", seller: { "@type": "Organization", name: "Fresh" } }]); expect(ld.brand).toEqual({ "@type": "Brand", name: "Brand" });
  });
});
