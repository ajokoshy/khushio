import { describe, expect, it } from "vitest";
import { MAX_ALLOWED_DOMAINS, normaliseDomain, parseAllowedDomains } from "@/modules/merchants/domains";
import { merchantInputSchema } from "@/modules/merchants/validation";

const ok = (entry: string) => {
  const r = normaliseDomain(entry);
  if (!r.ok) throw new Error(`expected ok for ${entry}: ${r.error}`);
  return r.domain;
};

describe("normaliseDomain", () => {
  it("accepts plain hostnames and lower-cases them", () => {
    expect(ok("amazon.in")).toBe("amazon.in");
    expect(ok("  WWW.Flipkart.com ")).toBe("www.flipkart.com");
    expect(ok("dl.flipkart.com")).toBe("dl.flipkart.com");
  });
  it("reduces pasted addresses to the host", () => {
    expect(ok("https://www.amazon.in/dp/B0?tag=x#top")).toBe("www.amazon.in");
    expect(ok("amazon.in:443/x")).toBe("amazon.in");
    expect(ok("*.myntra.com")).toBe("myntra.com");
    expect(ok("amazon.in.")).toBe("amazon.in");
  });
  it("converts international names to punycode", () => {
    expect(ok("bücher.example")).toBe("xn--bcher-kva.example");
  });
  it("rejects userinfo tricks, other schemes and junk", () => {
    for (const bad of ["https://amazon.in@evil.com", "user:pw@amazon.in", "ftp://amazon.in", "javascript:alert(1)", "not a domain", "-bad.com", "a_b.com", "amazon", "..", "https://", "a..b.com"]) {
      expect(normaliseDomain(bad).ok, bad).toBe(false);
    }
  });
  it("rejects IP addresses and localhost", () => {
    for (const bad of ["127.0.0.1", "10.0.0.1", "[::1]", "localhost", "1.2.3.4:8080"]) expect(normaliseDomain(bad).ok, bad).toBe(false);
  });
  it("rejects shared suffixes that would allow unrelated sites", () => {
    for (const bad of ["co.in", "vercel.app", "github.io", "com.au", "myshopify.com"]) {
      const r = normaliseDomain(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error).toContain("shared");
    }
    expect(normaliseDomain("mystore.myshopify.com").ok).toBe(true);
  });
});

describe("parseAllowedDomains", () => {
  it("splits on lines, commas and spaces, de-duplicates and keeps order", () => {
    expect(parseAllowedDomains("amazon.in\nwww.amazon.in, AMAZON.in; amzn.to").domains).toEqual(["amazon.in", "www.amazon.in", "amzn.to"]);
  });
  it("accepts an empty list", () => {
    expect(parseAllowedDomains("")).toEqual({ domains: [], errors: [] });
  });
  it("reports every bad entry", () => {
    const { errors } = parseAllowedDomains("amazon.in\nbad domain!\n127.0.0.1");
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
  it(`allows at most ${MAX_ALLOWED_DOMAINS}`, () => {
    const many = Array.from({ length: MAX_ALLOWED_DOMAINS + 1 }, (_, i) => `shop${i}.example.com`).join("\n");
    expect(parseAllowedDomains(many).errors.join(" ")).toContain("at most");
  });
});

describe("merchantInputSchema", () => {
  const base = { name: "Amazon India", slug: "", websiteUrl: "https://www.amazon.in", allowedDomains: "amazon.in\namzn.to", logoUrl: "" };
  it("parses a form post into clean values", () => {
    const r = merchantInputSchema.parse(base);
    expect(r).toMatchObject({ name: "Amazon India", slug: undefined, websiteUrl: "https://www.amazon.in", allowedDomains: ["amazon.in", "amzn.to"], logoUrl: null, confirmSlugChange: false });
  });
  it("puts a domain problem on the allowedDomains field", () => {
    const r = merchantInputSchema.safeParse({ ...base, allowedDomains: "co.in" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["allowedDomains"]);
  });
  it("rejects javascript: and credentials in addresses, and http logos", () => {
    for (const patch of [{ websiteUrl: "javascript:alert(1)" }, { websiteUrl: "https://u:p@amazon.in" }, { logoUrl: "http://x.com/a.png" }]) {
      expect(merchantInputSchema.safeParse({ ...base, ...patch }).success).toBe(false);
    }
  });
});
