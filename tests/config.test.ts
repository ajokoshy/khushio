import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { categories, categoryIcons, enabled, features, legalLinks, nav, site, toneClass } from "../lib/config/site";
import { getSettings, SETTING_DEFAULTS } from "../lib/settings";
const root = join(__dirname, "..");
describe("site config", () => {
  it("has a name, tagline and https url", () => { expect(site.name).toBe("Khushio"); expect(site.tagline).toContain("Live Happier"); expect(site.url.startsWith("https://")).toBe(true); });
  it("enabled() keeps only items whose feature is on", () => { const got = enabled(nav); expect(got.every((i) => features[i.feature])).toBe(true); });
  it("every enabled nav link has a page", () => { for (const i of enabled([...nav, ...legalLinks]).filter((x) => x.feature !== "legal")) expect(existsSync(join(root, "app", i.href, "page.tsx")), i.href).toBe(true); });
  it("legal links resolve through the [legal] route", () => expect(existsSync(join(root, "app/[legal]/page.tsx"))).toBe(true));
  it("nav hrefs are unique and start with a slash", () => { const h = nav.map((n) => n.href); expect(new Set(h).size).toBe(h.length); expect(h.every((x) => x.startsWith("/"))).toBe(true); });
  it("categories have unique slugs and valid icons", () => { expect(new Set(categories.map((c) => c.slug)).size).toBe(categories.length); for (const c of categories) expect(categoryIcons).toContain(c.icon); });
  it("tone classes exist", () => expect(Object.keys(toneClass).length).toBeGreaterThanOrEqual(7));
});
describe("settings", () => {
  it("returns defaults when there is no database", async () => expect(await getSettings()).toEqual(SETTING_DEFAULTS));
  it("has a three-line default headline", () => expect(SETTING_DEFAULTS.hero_title.split("\n")).toHaveLength(3));
});
describe("project hygiene", () => {
  it("never commits secrets in env files", () => { expect(readdirSync(root).filter((f) => /^\.env(\.|$)/.test(f) && f !== ".env.example")).toEqual([]); });
});
