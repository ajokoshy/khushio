import { describe, expect, it } from "vitest";
import { configFromForm, formValuesFromConfig, parseSectionConfig, SECTION_TYPES, STARTING_CONFIG } from "@/modules/homepage/config";
import { safeLinkTarget } from "@/modules/homepage/links";
import { sectionState } from "@/modules/homepage/service";
import { sectionInputSchema } from "@/modules/homepage/validation";
import { navItemInputSchema } from "@/modules/navigation/validation";

const ID = "33333333-3333-4333-8333-333333333333";

describe("safeLinkTarget", () => {
  it("accepts a path on this site and a plain https address", () => {
    expect(safeLinkTarget("/deals")).toBe("/deals");
    expect(safeLinkTarget("/categories/tea?sort=new")).toBe("/categories/tea?sort=new");
    expect(safeLinkTarget("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
  });
  it("refuses everything that could run script or leave the site by surprise", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "data:text/html,x", "http://example.com", "mailto:a@b.co", "//evil.example/x", "https://user:pw@example.com", "ftp://x.y", "", "  ", "deals", 5, null, undefined, "/a b", "https://"]) {
      expect(safeLinkTarget(bad), String(bad)).toBeNull();
    }
  });
});

describe("per-type section config validation", () => {
  it("every type has a starting config for the form, and the starting configs of the types that need nothing validate", () => {
    for (const type of SECTION_TYPES) expect(STARTING_CONFIG[type]).toBeDefined();
    for (const type of ["hero_banner", "featured_categories", "trending_products", "deals", "guides"] as const) expect(parseSectionConfig(type, STARTING_CONFIG[type]).ok, type).toBe(true);
  });

  it("applies the defaults for missing values", () => {
    expect(parseSectionConfig("trending_products", {})).toEqual({ ok: true, config: { mode: "featured", limit: 8 } });
    expect(parseSectionConfig("deals", {})).toEqual({ ok: true, config: { limit: 6 } });
  });

  it("drops unknown keys, so nothing but the known settings is ever stored", () => {
    const r = parseSectionConfig("deals", { limit: 4, html: "<script>alert(1)</script>", onclick: "x" });
    expect(r).toEqual({ ok: true, config: { limit: 4 } });
  });

  it("checks ranges, choices and ids, with the form's field names", () => {
    expect(parseSectionConfig("trending_products", { mode: "random", limit: 99 })).toMatchObject({ ok: false, fields: { c_mode: expect.any(String), c_limit: expect.any(String) } });
    expect(parseSectionConfig("deals", { limit: Number.NaN })).toMatchObject({ ok: false, fields: { c_limit: "Enter a whole number" } });
    expect(parseSectionConfig("featured_categories", { categoryIds: ["not-an-id"] })).toMatchObject({ ok: false });
    expect(parseSectionConfig("collections", { collectionIds: [] })).toMatchObject({ ok: false, fields: { c_collectionIds: "Choose at least one collection" } });
    expect(parseSectionConfig("collections", { collectionIds: [ID, ID, ID, ID, ID] })).toMatchObject({ ok: false });
    expect(parseSectionConfig("guides", { types: ["article"] })).toMatchObject({ ok: false });
    expect(parseSectionConfig("guides", { types: ["review", "how-to"], limit: 6 })).toMatchObject({ ok: true });
  });

  it("hero: a button needs both its text and a safe address; the picture must be a library id", () => {
    expect(parseSectionConfig("hero_banner", { ctaLabel: "Shop", ctaHref: null })).toMatchObject({ ok: false, fields: { c_ctaHref: expect.any(String) } });
    expect(parseSectionConfig("hero_banner", { ctaLabel: null, ctaHref: "/deals" })).toMatchObject({ ok: false, fields: { c_ctaLabel: expect.any(String) } });
    expect(parseSectionConfig("hero_banner", { ctaLabel: "Shop", ctaHref: "javascript:alert(1)" })).toMatchObject({ ok: false, fields: { c_ctaHref: expect.any(String) } });
    expect(parseSectionConfig("hero_banner", { imagePublicId: "https://evil.example/x.png" })).toMatchObject({ ok: false, fields: { coverPublicId: expect.any(String) } });
    expect(parseSectionConfig("hero_banner", { imagePublicId: "khushio/banners/diwali", ctaLabel: "Shop", ctaHref: "https://example.com/sale" })).toMatchObject({ ok: true });
  });

  it("promo: text is required and at most 160 characters; the colour is one of three", () => {
    expect(parseSectionConfig("promo_banner", { text: "" })).toMatchObject({ ok: false, fields: { c_text: "Enter the text" } });
    expect(parseSectionConfig("promo_banner", { text: "x".repeat(161) })).toMatchObject({ ok: false });
    expect(parseSectionConfig("promo_banner", { text: "Sale", tone: "red" })).toMatchObject({ ok: false, fields: { c_tone: expect.any(String) } });
    expect(parseSectionConfig("promo_banner", { text: "Sale" })).toEqual({ ok: true, config: { text: "Sale", ctaLabel: null, ctaHref: null, tone: "forest" } });
  });
});

describe("form values and config", () => {
  it("reads the posted text: empty is 'not given', lists come from one comma-separated value, numbers are numbers", () => {
    expect(configFromForm("guides", { c_types: "review, how-to,", c_limit: "6" })).toEqual({ types: ["review", "how-to"], limit: 6 });
    expect(configFromForm("deals", { c_limit: "" })).toEqual({ limit: undefined });
    expect(configFromForm("promo_banner", { c_text: " Sale ", c_ctaLabel: "", c_ctaHref: "", c_tone: "" })).toEqual({ text: "Sale", ctaLabel: null, ctaHref: null, tone: undefined });
    expect(configFromForm("hero_banner", { coverPublicId: "a/b", coverAlt: "alt", c_headline: "Hi" })).toMatchObject({ imagePublicId: "a/b", imageAlt: "alt", headline: "Hi", ctaLabel: null });
  });

  it("a stored config goes back into the form and out again unchanged", () => {
    for (const type of ["featured_categories", "trending_products", "deals", "guides", "promo_banner", "hero_banner"] as const) {
      const first = parseSectionConfig(type, { ...(STARTING_CONFIG[type] as object), ...(type === "promo_banner" ? { text: "Sale" } : {}) });
      expect(first.ok, type).toBe(true);
      if (!first.ok) continue;
      const again = parseSectionConfig(type, configFromForm(type, formValuesFromConfig(type, first.config)));
      expect(again, type).toEqual(first);
    }
  });
});

describe("section input and state", () => {
  it("reads the type, heading, switch and go-live time (typed in India time)", () => {
    const r = sectionInputSchema.parse({ type: "deals", heading: " Hot deals ", isEnabled: "on", publishAt: "2026-12-01T09:30" });
    expect(r).toMatchObject({ type: "deals", heading: "Hot deals", isEnabled: true });
    expect(r.publishAt?.toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(sectionInputSchema.parse({ type: "deals" })).toMatchObject({ heading: null, isEnabled: false, publishAt: null });
    expect(sectionInputSchema.safeParse({ type: "script" }).success).toBe(false);
    expect(sectionInputSchema.safeParse({ type: "deals", publishAt: "2026-02-31T10:00" }).success).toBe(false);
  });

  it("is live when switched on and past its go-live time; scheduled before it; off when switched off", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(sectionState({ isEnabled: true, publishAt: null }, now)).toBe("live");
    expect(sectionState({ isEnabled: true, publishAt: new Date("2026-11-30T00:00:00Z") }, now)).toBe("live");
    expect(sectionState({ isEnabled: true, publishAt: new Date("2026-12-01T00:00:01Z") }, now)).toBe("scheduled");
    expect(sectionState({ isEnabled: false, publishAt: null }, now)).toBe("off");
    expect(sectionState({ isEnabled: false, publishAt: new Date("2030-01-01T00:00:00Z") }, now)).toBe("off");
  });
});

describe("navigation link input", () => {
  it("accepts paths and https, refuses the rest", () => {
    expect(navItemInputSchema.safeParse({ area: "header", label: "Deals", href: "/deals", isActive: "on" }).success).toBe(true);
    expect(navItemInputSchema.safeParse({ area: "footer", label: "Blog", href: "https://example.com", isActive: "on" }).success).toBe(true);
    for (const href of ["javascript:alert(1)", "http://example.com", "//evil.example", "deals"]) expect(navItemInputSchema.safeParse({ area: "header", label: "x", href }).success, href).toBe(false);
    expect(navItemInputSchema.safeParse({ area: "sidebar", label: "x", href: "/a" }).success).toBe(false);
    expect(navItemInputSchema.safeParse({ area: "header", label: "x".repeat(41), href: "/a" }).success).toBe(false);
  });
});
