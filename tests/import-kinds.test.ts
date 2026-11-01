import { describe, expect, it } from "vitest";
import { parentCreatesCycle } from "../lib/categories";
import { IMPORT_KINDS, parseArticles, parseBrands, parseCategories, parseMerchants, parseOffers } from "../lib/import-kinds";
import { validateProductRows } from "../lib/import";
import { listingSeo } from "../lib/seo/listing";
import { flattenTree } from "../lib/search-core";

describe("merchants import", () => {
  const h = "name,slug,website,approved_domains,active\n";
  it("cleans domains, defaults to active, and rejects bad rows with a reason", () => {
    const v = parseMerchants(h + "Amazon India,,https://www.amazon.in,\"https://www.Amazon.in/, amzn.to\",\n,x,,,\nBad,bad,http://insecure.example,,\nOff,off,,,no\n");
    expect(v.rows.map((r) => [r.slug, r.approvedDomains, r.isActive])).toEqual([["amazon-india", "amazon.in, amzn.to", true], ["off", "", false]]);
    expect(v.errors).toEqual([{ line: 3, reason: "name is empty" }, { line: 4, reason: expect.stringContaining("https://") }]);
  });
  it("names missing required columns and reports duplicates in the file", () => {
    expect(parseMerchants("slug\nx\n").missingColumns).toEqual(["name"]);
    expect(parseMerchants("name\nA\nA\n").errors[0].reason).toContain("more than once");
  });
});
describe("brands and articles import", () => {
  it("builds slugs and validates", () => { expect(parseBrands("name,about\nGreen Leaf,Hello\n").rows[0]).toMatchObject({ slug: "green-leaf", about: "Hello" }); expect(parseBrands("name\n\n,\n").rows).toEqual([]); });
  it("requires title and body, validates the date and defaults it", () => {
    const v = parseArticles("title,body,date\nA,Text,2026-02-30x\nB,,\nC,Body,\nD,Body,2026-12-31\n", { today: "2026-11-01" });
    expect(v.rows.map((r) => [r.slug, r.date])).toEqual([["c", "2026-11-01"], ["d", "2026-12-31"]]); expect(v.errors.map((e) => e.line)).toEqual([2, 3]);
  });
});
describe("categories import", () => {
  const h = "label,slug,icon,tone,parent\n";
  it("accepts a parent defined later in the same file", () => expect(parseCategories(h + "Phones,phones,Sparkles,sand,gadgets\nGadgets,gadgets,Sparkles,sand,\n").rows.map((r) => r.slug)).toEqual(["phones", "gadgets"]));
  it("rejects unknown icons, colours and parents, and loops", () => {
    const v = parseCategories(h + "A,a,Nope,sand,\nB,b,Sparkles,nope,\nC,c,Sparkles,sand,ghost\nD,d,Sparkles,sand,e\nE,e,Sparkles,sand,d\nF,f,Sparkles,sand,f\n");
    expect(v.rows).toEqual([]); expect(v.errors.map((e) => e.reason)).toEqual([expect.stringContaining("icon"), expect.stringContaining("colour"), expect.stringContaining("does not exist"), expect.stringContaining("loop"), expect.stringContaining("loop"), expect.stringContaining("own parent")]);
  });
  it("sees existing categories when checking parents and loops", () => {
    expect(parseCategories(h + "New,new,Sparkles,sand,old\n", { categoryParents: { old: null } }).rows).toHaveLength(1);
    expect(parseCategories(h + "Old,old,Sparkles,sand,new\n", { categoryParents: { old: null, new: "old" } }).errors[0].reason).toContain("loop");
  });
});
describe("offers import", () => {
  const h = "product_slug,merchant,url,price,mrp,active,expires,price_checked\n";
  it("parses prices, flags, and end dates (end of day India time)", () => {
    const r = parseOffers(h + "jute,Shop A,https://a.example/p,899,1299,no,2026-12-31,yes\n").rows[0];
    expect(r).toMatchObject({ productSlug: "jute", price: 899, mrp: 1299, isActive: false, priceChecked: true, expiresAt: "2026-12-31T18:29:59.000Z", key: "jute|shop-a" });
  });
  it("rejects bad links, prices and dates", () => {
    const v = parseOffers(h + "a,S,http://x.example,,,,,\na,S,https://x.example,0,,,,\na,S,https://x.example,,500,,,\na,S,https://x.example,100,50,,,\na,S,https://x.example,,,,31-12-2026,\n");
    expect(v.rows).toEqual([]); expect(v.errors).toHaveLength(5);
  });
  it("allows the same product at different merchants but not twice at one", () => { expect(parseOffers(h + "a,S1,https://x.example,,,,,\na,S2,https://x.example,,,,,\na,S1,https://y.example,,,,,\n").rows).toHaveLength(2); });
});
describe("product import checks brands", () => {
  const head = "name,price,category,url,brand\n";
  it("rejects an unknown brand when a brand list is supplied", () => {
    expect(validateProductRows(head + "A,10,c,https://a.example,nope\n", ["c"], 500, ["known"]).errors[0].reason).toContain("unknown brand");
    expect(validateProductRows(head + "A,10,c,https://a.example,known\nB,10,c,https://a.example,\n", ["c"], 500, ["known"]).rows).toHaveLength(2);
  });
});
describe("kinds", () => it("every kind lists required columns", () => { for (const k of Object.values(IMPORT_KINDS)) expect(k.required.length).toBeGreaterThan(0); }));

describe("category tree helpers", () => {
  const cats = [{ id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" }];
  it("detects cycles", () => { expect(parentCreatesCycle(cats, "a", "c")).toBe(true); expect(parentCreatesCycle(cats, "a", "a")).toBe(true); expect(parentCreatesCycle(cats, "c", "a")).toBe(false); expect(parentCreatesCycle(cats, "a", null)).toBe(false); });
  it("flattens depth first", () => expect(flattenTree([{ id: "c", parentId: "b" }, { id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "z", parentId: "missing" }]).map((x) => `${x.cat.id}${x.depth}`)).toEqual(["a0", "b1", "c2", "z0"]));
});
describe("listing SEO", () => {
  it("keeps the base listing indexable with a clean canonical", () => { expect(listingSeo("/shop", {})).toMatchObject({ canonical: "/shop", noindex: false }); expect(listingSeo("/shop", { page: "3" })).toMatchObject({ canonical: "/shop?page=3", noindex: false }); });
  it("noindexes searches, sorts and price filters, with the plain canonical", () => { for (const raw of [{ q: "jute" }, { sort: "newest" }, { min: "100" }, { max: "900", page: "2" }]) expect(listingSeo("/shop", raw)).toMatchObject({ canonical: "/shop", noindex: true }); });
  it("treats a category filter as a filter only on /shop", () => { expect(listingSeo("/shop", { cat: "x" }, { catIsFilter: true }).noindex).toBe(true); expect(listingSeo("/categories/x", { cat: "x" }).noindex).toBe(false); });
});
