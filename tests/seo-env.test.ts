import { describe, expect, it } from "vitest";
// @ts-expect-error next.config.mjs is plain JavaScript without type declarations
import rawConfig from "../next.config.mjs";
import { cloudinaryConfigured, envIssues } from "../lib/config/env";
import { safeJson } from "../lib/seo/jsonld";

type Rule = { source: string; headers: { key: string; value: string }[] };
const config = rawConfig as { headers: () => Promise<Rule[]> };

describe("JSON-LD serialisation", () => {
  it("cannot close the script tag or start a comment", () => {
    const out = safeJson({ name: "</script><script>alert(1)</script>", x: "<!--" });
    expect(out).not.toContain("<"); expect(out).not.toContain(">");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
  it("escapes ampersands and line separators but round-trips", () => { const v = { a: "Tom & Jerry\u2028x" }; expect(safeJson(v)).not.toMatch(/&|\u2028/); expect(JSON.parse(safeJson(v))).toEqual(v); });
});

describe("environment checks", () => {
  const good = { DATABASE_URL: "postgres://x", AUTH_SECRET: "s".repeat(32), ADMIN_EMAIL: "a@b.c", ADMIN_PASSWORD_HASH: `${"a".repeat(32)}:${"b".repeat(128)}`, NEXT_PUBLIC_SITE_URL: "https://khushio.com" };
  it("passes a complete configuration", () => expect(envIssues(good)).toEqual([]));
  it("names every missing variable without echoing values", () => {
    const issues = envIssues({ AUTH_SECRET: "short-secret-value" });
    expect(issues.map((i) => i.key)).toEqual(expect.arrayContaining(["DATABASE_URL", "AUTH_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "NEXT_PUBLIC_SITE_URL"]));
    expect(JSON.stringify(issues)).not.toContain("short-secret-value");
  });
  it("flags a plain-text admin password in production", () => expect(envIssues({ ...good, NODE_ENV: "production", ADMIN_PASSWORD: "x" }).some((i) => i.key === "ADMIN_PASSWORD")).toBe(true));
  it("detects Cloudinary configuration", () => { expect(cloudinaryConfigured({})).toBe(false); expect(cloudinaryConfigured({ CLOUDINARY_CLOUD_NAME: "a", CLOUDINARY_API_KEY: "b", CLOUDINARY_API_SECRET: "c" })).toBe(true); });
});

describe("security headers", () => {
  it("are applied to every route, and admin responses are never cached", async () => {
    const rules = await config.headers(); const all = rules.find((r) => r.source === "/:path*")!.headers; const names = all.map((h) => h.key);
    for (const n of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy"]) expect(names).toContain(n);
    const csp = all.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'none'"); expect(csp).toContain("object-src 'none'"); expect(csp).toContain("base-uri 'self'");
    expect(rules.find((r) => r.source === "/admin/:path*")!.headers.find((h) => h.key === "Cache-Control")!.value).toContain("no-store");
  });
});
