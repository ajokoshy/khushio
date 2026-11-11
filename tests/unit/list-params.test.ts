import { describe, expect, it } from "vitest";
import { buildHref, parseListParams } from "@/shared/admin/list-params";
import { escapeLike } from "@/core/validation/like";

describe("parseListParams", () => {
  it("uses defaults", () => {
    expect(parseListParams({})).toEqual({ page: 1, pageSize: 25, offset: 0, q: undefined });
  });
  it("computes the offset from the page", () => {
    expect(parseListParams({ page: "3" }, { pageSize: 10 })).toMatchObject({ page: 3, offset: 20 });
  });
  it("falls back for malformed pages", () => {
    for (const bad of ["0", "-2", "abc", "1.5", "", "NaN"]) expect(parseListParams({ page: bad }).page).toBe(1);
  });
  it("caps the page", () => {
    expect(parseListParams({ page: "999999" }).page).toBe(1000);
    expect(parseListParams({ page: "999999" }, { maxPage: 50 }).page).toBe(50);
  });
  it("trims and limits the search text, takes the first of repeated params", () => {
    expect(parseListParams({ q: "  shoes  " }).q).toBe("shoes");
    expect(parseListParams({ q: "   " }).q).toBeUndefined();
    expect(parseListParams({ q: "x".repeat(300) }).q).toHaveLength(100);
    expect(parseListParams({ page: ["2", "5"] }).page).toBe(2);
  });
});

describe("buildHref", () => {
  it("omits empty values and encodes the rest", () => {
    expect(buildHref("/admin/audit", { q: "a b&c", page: undefined, attempts: false })).toBe("/admin/audit?q=a+b%26c");
    expect(buildHref("/admin/audit", { q: "", page: 2, attempts: true })).toBe("/admin/audit?page=2&attempts=1");
    expect(buildHref("/admin/audit", {})).toBe("/admin/audit");
  });
});

describe("escapeLike", () => {
  it("escapes wildcard characters so they match literally", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});
