import { describe, expect, it } from "vitest";
import { AFFILIATE_REL, approvedFor, checkDestination, hostAllowed, hostOf, isBot, parseDomains, safeReferrer } from "../lib/affiliate/rules";

describe("affiliate rel", () => it("is sponsored, nofollow, noopener and noreferrer", () => { for (const t of ["sponsored", "nofollow", "noopener", "noreferrer"]) expect(AFFILIATE_REL.split(" ")).toContain(t); }));

describe("destination checks", () => {
  const ok = (u: string, a: string[] = [], strict = false) => checkDestination(u, a, strict);
  it("accepts https links", () => expect(ok("https://shop.example/p?a=1").ok).toBe(true));
  it.each([["http://shop.example/p", "not-https"], ["javascript:alert(1)", "not-https"], ["//evil.example", "invalid"], ["not a url", "invalid"], ["https://user:pw@shop.example/", "credentials"]])("rejects %s", (u, reason) => expect(ok(u)).toEqual({ ok: false, reason }));
  it("enforces approved domains, including subdomains", () => {
    const approved = ["amazon.in", "amzn.to"];
    expect(ok("https://www.amazon.in/dp/1", approved).ok).toBe(true); expect(ok("https://amzn.to/abc", approved).ok).toBe(true); expect(ok("https://smile.amazon.in/x", approved).ok).toBe(true);
    expect(ok("https://evil.example/amazon.in", approved)).toEqual({ ok: false, reason: "domain" });
  });
  it("does not treat a look-alike host as a subdomain", () => expect(hostAllowed("notamazon.in", ["amazon.in"])).toBe(false));
  it("allows legacy links with no approved domains, unless strict", () => { expect(ok("https://anything.example/").ok).toBe(true); expect(ok("https://anything.example/", [], true)).toEqual({ ok: false, reason: "domain" }); });
});

describe("domain helpers", () => {
  it("parses messy lists", () => expect(parseDomains("https://www.Amazon.in/, amzn.to ;\nbad_host, amazon.in")).toEqual(["amazon.in", "amzn.to"]));
  it("reads hosts without www", () => { expect(hostOf("https://www.a.com/x")).toBe("a.com"); expect(hostOf("nope")).toBe(""); });
  it("merges approved list and website host", () => expect(approvedFor("amzn.to", "https://www.amazon.in")).toEqual(["amzn.to", "amazon.in"]));
});

describe("click hygiene", () => {
  it.each(["Googlebot/2.1", "facebookexternalhit/1.1", "curl/8.0", "python-requests/2.31", "", null])("treats %s as a bot", (ua) => expect(isBot(ua)).toBe(true));
  it("lets real browsers through", () => expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false));
  it("keeps only the path for same-site referrers and only the host for others", () => {
    expect(safeReferrer("https://khushio.com/products/x?utm=1&email=a@b.c", "https://khushio.com")).toBe("/products/x");
    expect(safeReferrer("https://www.google.com/search?q=secret", "https://khushio.com")).toBe("www.google.com");
    expect(safeReferrer(null, "https://khushio.com")).toBeNull(); expect(safeReferrer("garbage", "https://khushio.com")).toBeNull();
  });
});
