import { describe, expect, it } from "vitest";
import { LEGAL_PAGES, runChecks, summarise, type LaunchFacts } from "@/modules/launch/checks";

const now = new Date("2026-12-01T00:00:00Z");
const ready: LaunchFacts = {
  siteUrl: "https://khushio.com",
  hasDatabase: true,
  authSecretLength: 48,
  cronSecretLength: 32,
  cloudinaryConfigured: true,
  analytics: "vercel",
  cspEnforced: true,
  publishedPageSlugs: LEGAL_PAGES.map((p) => p.slug),
  publishedProducts: 40,
  activeAffiliateLinks: 55,
  activeAdmins: [{ email: "owner@khushio.com", roles: ["super_admin"], lastLoginAt: new Date("2026-11-28T00:00:00Z") }],
  robotsBlocksAll: false,
  now,
};
const status = (facts: LaunchFacts, id: string) => runChecks(facts).find((r) => r.id === id)?.status;

describe("launch checks", () => {
  it("a fully prepared site has nothing that blocks launch", () => {
    const summary = summarise(runChecks(ready));
    expect(summary.fail).toBe(0);
    expect(summary.ready).toBe(true);
    expect(summary.manual).toBeGreaterThan(0); // the by-hand items are always listed
  });
  it("localhost, plain http and a missing database or secrets block the launch", () => {
    expect(status({ ...ready, siteUrl: "http://localhost:3000" }, "site-url")).toBe("fail");
    expect(status({ ...ready, siteUrl: "http://khushio.com" }, "site-url")).toBe("fail");
    expect(status({ ...ready, siteUrl: "not a url" }, "site-url")).toBe("fail");
    expect(status({ ...ready, hasDatabase: false }, "database")).toBe("fail");
    expect(status({ ...ready, authSecretLength: 10 }, "auth-secret")).toBe("fail");
    expect(status({ ...ready, cronSecretLength: 0 }, "cron-secret")).toBe("fail");
  });
  it("each legal page is required, and the report names the one that is missing", () => {
    for (const page of LEGAL_PAGES) {
      const facts = { ...ready, publishedPageSlugs: ready.publishedPageSlugs.filter((s) => s !== page.slug) };
      expect(status(facts, `page-${page.slug}`)).toBe("fail");
      expect(summarise(runChecks(facts)).ready).toBe(false);
    }
  });
  it("a robots.txt that blocks everything blocks the launch", () => {
    expect(status({ ...ready, robotsBlocksAll: true }, "robots")).toBe("fail");
  });
  it("report-only CSP, analytics off and an empty catalogue are warnings, not blockers", () => {
    const facts = { ...ready, cspEnforced: false, analytics: "off" as const, publishedProducts: 0, activeAffiliateLinks: 0 };
    expect(status(facts, "csp")).toBe("warn");
    expect(status(facts, "analytics")).toBe("warn");
    expect(status(facts, "products")).toBe("warn");
    expect(status(facts, "links")).toBe("warn");
    expect(summarise(runChecks(facts)).ready).toBe(true);
  });
  it("lists the active admins for review, and warns about accounts nobody uses", () => {
    expect(status({ ...ready, activeAdmins: [] }, "admins")).toBe("fail");
    const facts = { ...ready, activeAdmins: [...ready.activeAdmins, { email: "old@khushio.com", roles: ["editor"], lastLoginAt: null }, { email: "gone@khushio.com", roles: ["editor"], lastLoginAt: new Date("2026-01-01T00:00:00Z") }] };
    const stale = runChecks(facts).find((r) => r.id === "stale-admins");
    expect(stale?.status).toBe("warn");
    expect(stale?.detail).toContain("old@khushio.com");
    expect(stale?.detail).toContain("gone@khushio.com");
    expect(stale?.detail).not.toContain("owner@khushio.com");
    expect(runChecks(facts).find((r) => r.id === "admins")?.detail).toContain("3 active");
  });
  it("warns when no account has the owner role", () => {
    expect(status({ ...ready, activeAdmins: [{ email: "e@khushio.com", roles: ["editor"], lastLoginAt: now }] }, "owners")).toBe("warn");
  });
});
