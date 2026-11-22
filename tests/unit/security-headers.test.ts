import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName, securityHeaders } from "@/core/security/csp";
import { clientKey, createRateLimiter } from "@/core/security/rate-limit";
import { formatRequestError } from "@/core/monitoring/log";
import { stripQuery } from "@/shared/analytics/strip-query";
import { POST } from "@/app/api/csp-report/route";
import { summariseReport } from "@/core/security/csp-report";

describe("Content-Security-Policy", () => {
  const csp = buildCsp({ analytics: false });
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("locks down plug-ins, framing, base address and forms", () => {
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("frame-src")).toBe("frame-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("report-uri /api/csp-report");
  });
  it("never allows eval or scripts from other sites", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(directive("script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/script-src[^;]*https?:/);
  });
  it("lets the browser upload straight to Cloudinary and nowhere else", () => {
    expect(directive("connect-src")).toBe("connect-src 'self' https://api.cloudinary.com");
  });
  it("adds the analytics hosts only when analytics is on", () => {
    const on = buildCsp({ analytics: true });
    expect(on).toContain("https://va.vercel-scripts.com");
    expect(on).toContain("https://vitals.vercel-insights.com");
    expect(csp).not.toContain("vercel");
  });
});

describe("securityHeaders", () => {
  const names = (h: { key: string }[]) => h.map((x) => x.key);
  it("production sends the policy in report-only mode first, and enforces it only when asked", () => {
    expect(names(securityHeaders({ production: true, enforceCsp: false, analytics: false }))).toContain("Content-Security-Policy-Report-Only");
    expect(names(securityHeaders({ production: true, enforceCsp: false, analytics: false }))).not.toContain("Content-Security-Policy");
    expect(names(securityHeaders({ production: true, enforceCsp: true, analytics: false }))).toContain("Content-Security-Policy");
    expect(cspHeaderName(true)).toBe("Content-Security-Policy");
  });
  it("always sends the basic protections, and leaves the policy out in development", () => {
    const dev = securityHeaders({ production: false, enforceCsp: true, analytics: false });
    for (const key of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security", "Cross-Origin-Opener-Policy"]) expect(names(dev)).toContain(key);
    expect(names(dev).some((k) => k.startsWith("Content-Security"))).toBe(false);
    expect(dev.find((h) => h.key === "X-Frame-Options")?.value).toBe("DENY");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit in a window, refuses the rest, and starts again after the window", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => now });
    expect([1, 2, 3, 4, 5].map(() => limiter.allow("a"))).toEqual([true, true, true, false, false]);
    expect(limiter.allow("b")).toBe(true); // another visitor is not affected
    now = 1001;
    expect(limiter.allow("a")).toBe(true);
  });
  it("keeps memory bounded under a flood of different addresses", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) limiter.allow(`ip-${i}`);
    expect(limiter.size()).toBeLessThanOrEqual(101);
  });
  it("reads the visitor address from the forwarding header", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});

describe("/api/csp-report", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(new NextRequest("https://khushio.com/api/csp-report", { method: "POST", body, headers: { "content-type": "application/csp-report", "x-forwarded-for": "198.51.100.77", ...headers } }));

  it("always answers 204, whatever it is sent", async () => {
    for (const body of ["", "not json", "{}", "[]", JSON.stringify({ "csp-report": { "blocked-uri": "https://evil.example/x.js?secret=1", "violated-directive": "script-src" } })]) {
      expect((await post(body)).status).toBe(204);
    }
  });
  it("ignores an oversized body without reading it into the logs", async () => {
    expect((await post("x".repeat(20_000), { "content-length": "20000" })).status).toBe(204);
  });
  it("summarises both report formats and drops query strings", () => {
    expect(summariseReport({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://x.example/a.png?token=1", "document-uri": "https://khushio.com/products/a?q=secret" } })).toMatchObject({ directive: "img-src", blocked: "https://x.example/a.png", page: "https://khushio.com/products/a" });
    expect(summariseReport([{ type: "csp-violation", body: { effectiveDirective: "script-src", blockedURL: "inline", documentURL: "https://khushio.com/" } }])).toMatchObject({ directive: "script-src", blocked: "inline" });
    expect(summariseReport("junk")).toBeNull();
    expect(summariseReport({ "csp-report": 7 })).toBeNull();
  });
});

describe("error log line", () => {
  it("is one structured line with no query string and a clipped message", () => {
    const err = Object.assign(new Error(`insert failed for email a@b.example ${"x".repeat(500)}`), { digest: "abc123" });
    const line = formatRequestError({ error: err, request: { path: "/discover?q=private+search", method: "GET" }, context: { routerKind: "App Router", routePath: "/discover", routeType: "render" } });
    expect(line).toMatchObject({ event: "khushio.error", digest: "abc123", method: "GET", path: "/discover", route: "/discover" });
    expect(line.message.length).toBeLessThanOrEqual(300);
    expect(JSON.stringify(line)).not.toContain("private");
    expect(formatRequestError({ error: "plain string", request: { path: "/", method: "POST" }, context: {} }).message).toBe("plain string");
  });
});

describe("analytics address stripping", () => {
  it("removes search words and fragments before an address is sent", () => {
    expect(stripQuery({ type: "pageview", url: "https://khushio.com/discover?q=blue+shoes&brand=x#top" }).url).toBe("https://khushio.com/discover");
    expect(stripQuery({ type: "pageview", url: "not a url" }).url).toBe("not a url");
  });
});
