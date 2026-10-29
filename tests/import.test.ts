import { describe, expect, it } from "vitest";
import { parseProductRows } from "../lib/import";
const cats = ["home-living", "kids-baby"];
const head = "slug,name,brand,category,blurb,price,mrp,status,merchant,url\n";
describe("product import", () => {
  it("accepts a valid row and normalises fields", () => {
    const { rows, skipped } = parseProductRows(head + ',My Basket,Green Leaf,home-living,Nice,899,1299,draft,Shop A,https://a.com/x\n', cats);
    expect(skipped).toBe(0); expect(rows[0]).toMatchObject({ slug: "my-basket", brand: "green-leaf", price: 899, mrp: 1299, status: "draft", merchant: "Shop A" });
  });
  it("defaults status, merchant and mrp", () => { const { rows } = parseProductRows(head + ",A,,kids-baby,,10,,,,https://a.com\n", cats); expect(rows[0]).toMatchObject({ status: "published", merchant: "Store", mrp: null }); });
  it.each([
    ["missing name", ",,home-living,,10,,,,https://a.com"], ["zero price", "A,,home-living,,0,,,,https://a.com"], ["bad price", "A,,home-living,,abc,,,,https://a.com"],
    ["http link", "A,,home-living,,10,,,,http://a.com"], ["unknown category", "A,,nope,,10,,,,https://a.com"], ["javascript link", "A,,home-living,,10,,,,javascript:alert(1)"],
  ])("skips %s", (_n, line) => { const r = parseProductRows(head + "," + line + "\n", cats); expect(r.rows).toHaveLength(0); expect(r.skipped).toBe(1); });
  it("caps rows at the limit and counts the rest as skipped", () => {
    const body = Array.from({ length: 5 }, (_, i) => `,P${i},,home-living,,10,,,,https://a.com`).join("\n");
    const r = parseProductRows(head + body, cats, 3); expect(r.rows).toHaveLength(3); expect(r.skipped).toBe(2);
  });
  it("removes the export formula guard", () => { const { rows } = parseProductRows(head + `,"'=Name",,home-living,,10,,,,https://a.com\n`, cats); expect(rows[0].name).toBe("=Name"); });
  it("reads columns in any order", () => { const { rows } = parseProductRows("url,price,category,name\nhttps://a.com,5,home-living,Z\n", cats); expect(rows[0]).toMatchObject({ name: "Z", price: 5 }); });
  it("handles an empty file", () => expect(parseProductRows("", cats)).toEqual({ rows: [], skipped: 0 }));
});
