import { describe, expect, it } from "vitest";
import { cleanNavItem } from "../lib/nav-core";
import { cleanPageSlug, DEFAULT_PAGES, RESERVED_SLUGS } from "../lib/pages-core";
import { parseMarkdown } from "../lib/markdown";
import { cleanSetting, SETTINGS, SETTING_DEFAULTS, type SettingDef } from "../lib/settings-schema";

const def = (type: SettingDef["type"], max = 50): SettingDef => ({ key: "k", group: "g", label: "l", type, max, default: "" });
describe("settings schema", () => {
  it("has unique keys, defaults within their own limits, and valid defaults", () => {
    expect(new Set(SETTINGS.map((s) => s.key)).size).toBe(SETTINGS.length);
    for (const s of SETTINGS) { expect(s.default.length, s.key).toBeLessThanOrEqual(s.max); expect(cleanSetting(s, s.default).ok, s.key).toBe(true); }
  });
  it("keeps the three-line default headline", () => expect(SETTING_DEFAULTS.hero_title.split("\n")).toHaveLength(3));
  it("only accepts https addresses for url settings", () => { expect(cleanSetting(def("url"), "https://instagram.com/x").ok).toBe(true); for (const bad of ["http://x.example", "javascript:alert(1)", "instagram.com/x", "https://a b"]) expect(cleanSetting(def("url"), bad).ok, bad).toBe(false); expect(cleanSetting(def("url"), "")).toEqual({ ok: true, value: "" }); });
  it("validates emails and paths", () => { expect(cleanSetting(def("email"), "a@b.co").ok).toBe(true); expect(cleanSetting(def("email"), "not an email").ok).toBe(false); expect(cleanSetting(def("path"), "/deals").ok).toBe(true); expect(cleanSetting(def("path"), "https://x.example/y").ok).toBe(true); for (const bad of ["//evil.example", "javascript:x", "deals", "/a b"]) expect(cleanSetting(def("path"), bad).ok, bad).toBe(false); });
  it("enforces length and single-line rules, and strips control characters", () => {
    expect(cleanSetting(def("text", 5), "abcdef").ok).toBe(false); expect(cleanSetting(def("text"), "a\nb").ok).toBe(false); expect(cleanSetting(def("textarea"), "a\r\nb")).toEqual({ ok: true, value: "a\nb" });
    expect(cleanSetting(def("text"), "a\u0000b\u0007c")).toEqual({ ok: true, value: "abc" });
  });
});
describe("navigation links", () => {
  it("accepts paths and https links with a sensible label", () => { expect(cleanNavItem(" Deals  now ", "/deals")).toEqual({ ok: true, label: "Deals now", href: "/deals" }); expect(cleanNavItem("Blog", "https://blog.example").ok).toBe(true); });
  it("refuses empty or long labels and unsafe addresses", () => { expect(cleanNavItem("", "/x")).toEqual({ ok: false, reason: "label" }); expect(cleanNavItem("x".repeat(41), "/x")).toEqual({ ok: false, reason: "label" }); for (const h of ["javascript:alert(1)", "http://x.example", "//evil.example", "deals", ""]) expect(cleanNavItem("Ok", h), h).toEqual({ ok: false, reason: "href" }); });
});
describe("pages", () => {
  it("normalises custom page addresses and refuses reserved ones", () => { expect(cleanPageSlug("  Returns & Refunds! ")).toBe("returns-refunds"); for (const r of ["admin", "Shop", "go", "api", "journal", "---", ""]) expect(cleanPageSlug(r), r).toBeNull(); });
  it("never lets a built-in page slug collide with a reserved address", () => { for (const s of Object.keys(DEFAULT_PAGES)) expect(RESERVED_SLUGS.has(s), s).toBe(false); });
  it("built-in pages are valid, safe Markdown with no embeds", () => { for (const [slug, p] of Object.entries(DEFAULT_PAGES)) { const b = parseMarkdown(p.body); expect(b.length, slug).toBeGreaterThan(0); expect(b.every((x) => x.t !== "product" && x.t !== "img"), slug).toBe(true); expect(p.description.length, slug).toBeLessThanOrEqual(170); } });
});
