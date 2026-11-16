import { describe, expect, it } from "vitest";
import { buildRedirectTarget, checkDestination, hostMatchesAllowed, parseTrackingParams } from "@/modules/affiliate/destination";

const AMAZON = ["amazon.in", "amzn.to"];
const ok = (raw: string, allowed: readonly string[] = AMAZON) => checkDestination(raw, allowed);

describe("destination safety check (Release 4A)", () => {
  it("accepts the allowed domain, its subdomains and mixed case", () => {
    expect(ok("https://amazon.in/dp/B0123").ok).toBe(true);
    expect(ok("https://www.amazon.in/dp/B0123?x=1#frag").ok).toBe(true);
    expect(ok("https://smile.deep.amazon.in/").ok).toBe(true);
    expect(ok("HTTPS://WWW.AMAZON.IN/dp/B0123").ok).toBe(true);
    expect(ok("https://amzn.to/3abcDEF").ok).toBe(true);
    expect(ok("https://amazon.in./dp/1").ok).toBe(true); // a trailing dot is the same host
  });

  it.each([
    ["a look-alike that ends with the allowed name", "https://amazon.in.evil.com/"],
    ["a look-alike that starts with it", "https://evilamazon.in/"],
    ["the allowed name as a path", "https://evil.com/amazon.in"],
    ["the allowed name as a query", "https://evil.com/?u=https://amazon.in"],
    ["userinfo trick (host after @)", "https://amazon.in@evil.com/"],
    ["userinfo trick with a password", "https://amazon.in:secret@evil.com/"],
    ["userinfo naming the real host but pointing elsewhere", "https://www.amazon.in%2eevil.com@evil.com/"],
    ["a hyphen look-alike", "https://amazon-in.com/"],
    ["a different top level", "https://amazon.in.net/"],
    ["a sibling of an allowed subdomain", "https://xamazon.in/"],
  ])("refuses %s", (_label, raw) => {
    const result = ok(raw);
    expect(result.ok).toBe(false);
  });

  it("refuses punycode look-alikes and keeps real punycode working", () => {
    expect(ok("https://аmazon.in/").ok).toBe(false); // Cyrillic а
    expect(ok("https://xn--mazon-3ve.in/").ok).toBe(false);
    expect(ok("https://amazon.xn--p1ai/").ok).toBe(false);
    expect(checkDestination("https://bücher.example/x", ["xn--bcher-kva.example"]).ok).toBe(true); // stored in punycode, typed with the umlaut
    expect(checkDestination("https://xn--bcher-kva.example/x", ["bücher.example"]).ok).toBe(false); // a non-ASCII entry never matches (entries are normalised on save)
  });

  it.each([
    ["http", "http://amazon.in/"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<script>1</script>"],
    ["file", "file:///etc/passwd"],
    ["ftp", "ftp://amazon.in/"],
    ["protocol-relative", "//evil.com/"],
    ["relative", "/dp/B0123"],
    ["bare host", "amazon.in/dp/B0123"],
    ["an empty string", "   "],
  ])("refuses a %s address", (_label, raw) => {
    expect(ok(raw).ok).toBe(false);
  });

  it("refuses characters that the URL parser would silently drop or reinterpret", () => {
    expect(ok("https://amazon.in\t.evil.com/").ok).toBe(false);
    expect(ok("https://amazon.in\n.evil.com/").ok).toBe(false);
    expect(ok("https://ama zon.in/").ok).toBe(false);
    expect(ok("https://evil.com\\@amazon.in/").ok).toBe(false);
    expect(ok("https://amazon.in\u0000/").ok).toBe(false);
    expect(ok("https://amazon.in/\u200b").ok).toBe(true); // outside the path/host rules: allowed, it cannot change the host
  });

  it("refuses IP addresses in every spelling, ports and credentials", () => {
    for (const raw of ["https://127.0.0.1/", "https://2130706433/", "https://0x7f.1/", "https://[::1]/", "https://169.254.169.254/latest", "https://10.0.0.1/"]) {
      expect(ok(raw, ["127.0.0.1", "169.254.169.254", "10.0.0.1"]).ok, raw).toBe(false);
    }
    expect(ok("https://amazon.in:8443/").ok).toBe(false);
    expect(ok("https://user:pass@amazon.in/").ok).toBe(false);
    expect(ok("https://amazon.in:443/").ok).toBe(true); // the default port is normalised away
  });

  it("refuses when the merchant has no allowed domains, and reports why", () => {
    const r = ok("https://amazon.in/", []);
    expect(r).toMatchObject({ ok: false, code: "no_domains" });
  });

  it("reports the reason code for each kind of refusal", () => {
    expect(ok("https://evil.com/")).toMatchObject({ ok: false, code: "not_allowed" });
    expect(ok("http://amazon.in/")).toMatchObject({ ok: false, code: "scheme" });
    expect(ok("https://u:p@amazon.in/")).toMatchObject({ ok: false, code: "credentials" });
    expect(ok("https://amazon.in:81/")).toMatchObject({ ok: false, code: "port" });
    expect(ok("https://1.2.3.4/")).toMatchObject({ ok: false, code: "host" });
    expect(ok("nonsense")).toMatchObject({ ok: false, code: "invalid" });
  });

  it("rejects an address longer than 2048 characters", () => {
    expect(ok(`https://amazon.in/${"a".repeat(2100)}`).ok).toBe(false);
  });
});

describe("hostMatchesAllowed", () => {
  it("matches label by label", () => {
    expect(hostMatchesAllowed("www.amazon.in", ["amazon.in"])).toBe(true);
    expect(hostMatchesAllowed("amazon.in", ["www.amazon.in"])).toBe(false); // a www entry does not allow the bare domain
    expect(hostMatchesAllowed("notamazon.in", ["amazon.in"])).toBe(false);
  });

  it("ignores entries that are empty, have no dot or contain odd characters", () => {
    expect(hostMatchesAllowed("evil.com", ["", " ", "com", "evil.com/x", "*.evil.com"])).toBe(false);
  });
});

describe("tracking parameters", () => {
  it("parses pairs, a leading ?, new lines, and keeps the one-line canonical form", () => {
    expect(parseTrackingParams("?tag=khushio-21&ascsubtag={subid}")).toMatchObject({ ok: true, value: "tag=khushio-21&ascsubtag={subid}" });
    expect(parseTrackingParams("tag=a\nsource=khushio")).toMatchObject({ ok: true, value: "tag=a&source=khushio" });
    expect(parseTrackingParams("   ")).toEqual({ ok: true, value: null, params: [] });
    expect(parseTrackingParams(undefined)).toEqual({ ok: true, value: null, params: [] });
  });

  it.each([
    ["a missing value", "tag="],
    ["a name with spaces", "my tag=1"],
    ["a name that starts with a symbol", "-tag=1"],
    ["a duplicate name", "tag=1&TAG=2"],
    ["an unknown placeholder", "tag={click}"],
    ["a broken percent code", "tag=%E0%A4%A"],
    ["a control character", "tag=a%00b"],
    ["more than ten pairs", Array.from({ length: 11 }, (_, i) => `p${i}=1`).join("&")],
    ["a value over 200 characters", `tag=${"x".repeat(201)}`],
  ])("rejects %s", (_label, text) => {
    expect(parseTrackingParams(text).ok).toBe(false);
  });

  it("sets the parameters on the destination, replacing ones it already has, and substitutes {subid}", () => {
    const dest = new URL("https://www.amazon.in/dp/B0123?tag=someone-else&ref=nav#reviews");
    const target = buildRedirectTarget(dest, "tag=khushio-21&ascsubtag={subid}", "amazon-sony-xm5");
    const url = new URL(target.url);
    expect(url.searchParams.getAll("tag")).toEqual(["khushio-21"]);
    expect(url.searchParams.get("ascsubtag")).toBe("amazon-sony-xm5");
    expect(url.searchParams.get("ref")).toBe("nav");
    expect(url.hash).toBe("#reviews");
    expect(url.host).toBe("www.amazon.in");
    expect(target.subId).toBe("amazon-sony-xm5");
  });

  it("returns the destination untouched when there are no parameters, and reports no sub-ID", () => {
    const dest = new URL("https://amazon.in/dp/B0123?a=b%20c");
    expect(buildRedirectTarget(dest, null, "slug")).toEqual({ url: "https://amazon.in/dp/B0123?a=b%20c", subId: null });
    expect(buildRedirectTarget(dest, "tag=x", "slug").subId).toBeNull(); // no {subid} placeholder: none sent
  });

  it("never lets a stored value change the host, and encodes what it adds", () => {
    const dest = new URL("https://amazon.in/dp/1");
    const target = buildRedirectTarget(dest, "u=https%3A%2F%2Fevil.com%2F&n=a%20b", "s");
    expect(new URL(target.url).host).toBe("amazon.in");
    expect(new URL(target.url).searchParams.get("u")).toBe("https://evil.com/");
  });

  it("ignores broken stored parameters instead of failing the redirect", () => {
    const dest = new URL("https://amazon.in/dp/1");
    expect(buildRedirectTarget(dest, "tag=%E0%A4%A", "s").url).toBe("https://amazon.in/dp/1");
  });
});
