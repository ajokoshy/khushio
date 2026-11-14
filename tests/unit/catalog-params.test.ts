import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@/modules/catalog/cursor";
import { filtersToParams, isFilteredView, normalizeSearch, parseCatalogParams } from "@/modules/catalog/filters";

const ID = "11111111-1111-1111-1111-111111111111";

describe("cursor", () => {
  it("round-trips each kind", () => {
    for (const c of [
      { s: "new", c: "2026-11-13 06:13:21.123456+00", id: ID },
      { s: "name", n: "blue shoe", id: ID },
      { s: "rank", r: "0.6079", id: ID, m: "fts" },
    ] as const) expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("ignores anything that is not a well-formed cursor", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("garbage")).toBeNull();
    expect(decodeCursor(encodeCursor({ s: "rank", r: "1; drop table products", id: ID, m: "fts" } as never))).toBeNull();
    expect(decodeCursor(encodeCursor({ s: "new", c: "yesterday", id: ID } as never))).toBeNull();
    expect(decodeCursor(encodeCursor({ s: "new", c: "2026-11-13 06:13:21+00", id: "not-a-uuid" }))).toBeNull();
  });
});

describe("catalogue address parameters", () => {
  it("normalises search text", () => {
    expect(normalizeSearch("  blue   shoes \n")).toBe("blue shoes");
    expect(normalizeSearch("a")).toBeUndefined();
    expect(normalizeSearch("x".repeat(200))?.length).toBe(80);
  });
  it("reads prices in rupees and swaps a reversed range", () => {
    const f = parseCatalogParams({ min: "5,000", max: "1000" });
    expect([f.minPrice, f.maxPrice]).toEqual([100000, 500000]);
  });
  it("drops malformed values instead of failing", () => {
    const f = parseCatalogParams({ brand: "Bad Slug!", category: "../x", min: "abc", sort: "price" });
    expect(f).toMatchObject({ brand: undefined, category: undefined, minPrice: undefined, sort: "new" });
  });
  it("defaults a search to relevance, and relevance without a search to newest", () => {
    expect(parseCatalogParams({ q: "shoes" }).sort).toBe("relevance");
    expect(parseCatalogParams({ q: "shoes", sort: "name" }).sort).toBe("name");
    expect(parseCatalogParams({ sort: "relevance" }).sort).toBe("new");
  });
  it("marks filtered views and writes filters back", () => {
    expect(isFilteredView(parseCatalogParams({}))).toBe(false);
    expect(isFilteredView(parseCatalogParams({ q: "shoes" }))).toBe(true);
    expect(isFilteredView(parseCatalogParams({ cursor: "abc" }))).toBe(true);
    expect(filtersToParams(parseCatalogParams({ q: "shoes", min: "100" }))).toEqual({ q: "shoes", brand: undefined, category: undefined, min: "100", max: undefined, sort: undefined });
  });
});
