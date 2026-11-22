import { describe, expect, it } from "vitest";
import { buildMap, checkRule, fromWire, lookupRedirect, normalizePath, pathOfRequest, toWire, type RuleLike } from "@/modules/redirects/path";

const rule = (fromPath: string, toPath: string | null, statusCode = 301, id?: string): RuleLike => ({ id, fromPath, toPath, statusCode });

describe("normalizePath", () => {
  it("lower-cases, trims and drops the trailing slash", () => {
    expect(normalizePath("  /Products/Old-Name/ ")).toBe("/products/old-name");
    expect(normalizePath("/")).toBe("/");
  });
  it("refuses anything that is not a plain path on this site", () => {
    for (const bad of ["", "products/x", "//evil.com/x", "https://khushio.com/x", "/x?y=1", "/x#top", "/a b", "/x\\y", "/a//b", "/../admin", "/a/./b", "/é"]) expect(normalizePath(bad), bad).toBeNull();
    expect(normalizePath(`/${"a".repeat(400)}`)).toBeNull();
  });
});

describe("checkRule", () => {
  it("accepts a plain 301, a 302 and a 410", () => {
    expect(checkRule(rule("/a", "/b"), [])).toBeNull();
    expect(checkRule(rule("/a", "/b", 302), [])).toBeNull();
    expect(checkRule(rule("/a", null, 410), [])).toBeNull();
  });
  it("refuses the home page, the admin, the API and /go as an old address or a target", () => {
    for (const from of ["/", "/admin", "/admin/products", "/admin-login", "/api/health", "/go/x", "/_next/x"]) expect(checkRule(rule(from, "/b"), [])?.field, from).toBe("fromPath");
    expect(checkRule(rule("/a", "/admin/dashboard"), [])?.field).toBe("toPath");
  });
  it("a 410 has no target and every other rule has one that differs from the old address", () => {
    expect(checkRule(rule("/a", "/b", 410), [])?.field).toBe("toPath");
    expect(checkRule(rule("/a", null, 301), [])?.field).toBe("toPath");
    expect(checkRule(rule("/a", "/a"), [])?.field).toBe("toPath");
    expect(checkRule(rule("/a", "/b", 404), [])?.field).toBe("statusCode");
  });
  it("rejects a second rule for the same old address, but lets a rule be edited", () => {
    expect(checkRule(rule("/a", "/c"), [rule("/a", "/b", 301, "1")])?.field).toBe("fromPath");
    expect(checkRule(rule("/a", "/c", 301, "1"), [rule("/a", "/b", 301, "1")])).toBeNull();
  });
  it("rejects chains in both directions", () => {
    // /b already redirects, so /a -> /b would hop twice
    expect(checkRule(rule("/a", "/b"), [rule("/b", "/c")])?.message).toContain("/c");
    // /x already points at /a, so /a -> /b would make /x -> /a -> /b
    expect(checkRule(rule("/a", "/b"), [rule("/x", "/a")])?.field).toBe("fromPath");
    // gone targets
    expect(checkRule(rule("/a", "/b"), [rule("/b", null, 410)])?.message).toContain("gone");
    expect(checkRule(rule("/a", null, 410), [rule("/x", "/a")])?.field).toBe("fromPath");
  });
  it("rejects a loop", () => {
    expect(checkRule(rule("/a", "/b"), [rule("/b", "/a")])?.message).toContain("loop");
  });
});

describe("the lookup map", () => {
  const map = buildMap([{ fromPath: "/products/old", toPath: "/products/new", statusCode: 301 }, { fromPath: "/p/gone", toPath: null, statusCode: 410 }]);
  it("matches ignoring case and a trailing slash, and nothing else", () => {
    expect(lookupRedirect(map, "/Products/OLD/")).toEqual({ toPath: "/products/new", statusCode: 301 });
    expect(lookupRedirect(map, "/p/gone")?.statusCode).toBe(410);
    expect(lookupRedirect(map, "/products/other")).toBeNull();
    expect(lookupRedirect(map, "/products/old/extra")).toBeNull();
    expect(pathOfRequest("/")).toBe("/");
  });
  it("travels as compact triples and a bad response is read defensively", () => {
    const rules = [{ fromPath: "/a", toPath: "/b", statusCode: 301 as const }, { fromPath: "/c", toPath: null, statusCode: 410 as const }];
    expect(fromWire({ rules: toWire(rules) })).toEqual(rules);
    expect(fromWire(null)).toEqual([]);
    expect(fromWire({ rules: "nope" })).toEqual([]);
    expect(fromWire({ rules: [["/a"], ["/a", "/b", 200], ["/a", null, 301], ["/a", "/b", 410], 7, ["/ok", "/fine", 302]] })).toEqual([{ fromPath: "/ok", toPath: "/fine", statusCode: 302 }]);
  });
});
