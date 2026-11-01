import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, SECTION_ORDER, SECTION_TYPES, cleanConfig, parseTrustItems, resolveConfig, visibility, type SectionDef } from "../lib/home/sections";

describe("section definitions", () => {
  it("offers at least fifteen section types", () => expect(SECTION_ORDER.length).toBeGreaterThanOrEqual(15));
  it("every field has a unique key per type, and valid defaults", () => {
    for (const t of SECTION_ORDER) { const keys = (SECTION_TYPES[t] as SectionDef).fields.map((f) => f.key); expect(new Set(keys).size, t).toBe(keys.length);
      for (const f of (SECTION_TYPES[t] as SectionDef).fields) { if (f.kind === "select") expect(f.options?.some((o) => o.value === f.default), `${t}.${f.key}`).toBe(true); if (f.kind === "int") { expect(f.default as number).toBeGreaterThanOrEqual(f.min ?? 0); expect(f.default as number).toBeLessThanOrEqual(f.max ?? 100); } } }
  });
  it("every default layout section is a real type and starts with the hero", () => { for (const s of DEFAULT_LAYOUT) expect(SECTION_ORDER).toContain(s.type); expect(DEFAULT_LAYOUT[0].type).toBe("hero"); });
  it("default config values validate against their own rules", () => { for (const t of SECTION_ORDER) { const raw: Record<string, string> = {}; for (const f of (SECTION_TYPES[t] as SectionDef).fields) if (f.kind !== "bool" && f.kind !== "slugs") raw[f.key] = String(f.default ?? ""); expect(cleanConfig(t, raw), t).toEqual({ ok: true, config: {} }); } });
});
describe("cleanConfig", () => {
  it("keeps only values that differ from the defaults", () => { expect(cleanConfig("featured_products", { title: "Featured", limit: "4" })).toEqual({ ok: true, config: {} }); expect(cleanConfig("featured_products", { title: "Best sellers", limit: "8" })).toEqual({ ok: true, config: { title: "Best sellers", limit: 8 } }); });
  it("clamps numbers into range and survives rubbish", () => { expect(cleanConfig("deals", { limit: "9999" })).toEqual({ ok: true, config: { limit: 6 } }); expect(cleanConfig("deals", { limit: "-3" })).toEqual({ ok: true, config: { limit: 1 } }); expect(cleanConfig("deals", { limit: "abc" })).toEqual({ ok: true, config: {} }); });
  it("accepts only listed select values", () => { expect(cleanConfig("hero", { variant: "centered" })).toEqual({ ok: true, config: { variant: "centered" } }); expect(cleanConfig("hero", { variant: "<script>" })).toEqual({ ok: true, config: {} }); });
  it("turns addresses into a clean unique list, capped", () => { const r = cleanConfig("product_row", { slugs: "Jute Basket, steel-bottle\njute-basket, ../../x, " }); expect(r).toEqual({ ok: true, config: { slugs: ["jute-basket", "steel-bottle", "x"] } }); const many = Array.from({ length: 40 }, (_, i) => `p${i}`).join(","); expect((cleanConfig("product_row", { slugs: many }) as unknown as { config: { slugs: string[] } }).config.slugs).toHaveLength(12); });
  it("keeps media only when it is a uuid", () => { expect(cleanConfig("hero", { image: "11111111-1111-1111-1111-111111111111" })).toEqual({ ok: true, config: { image: "11111111-1111-1111-1111-111111111111" } }); expect(cleanConfig("hero", { image: "javascript:alert(1)" })).toEqual({ ok: true, config: {} }); });
  it("rejects unsafe button links and over-long text", () => {
    expect(cleanConfig("banner", { cta_href: "javascript:alert(1)" })).toMatchObject({ ok: false, field: "cta_href" }); expect(cleanConfig("banner", { cta_href: "/deals" }).ok).toBe(true);
    expect(cleanConfig("deals", { title: "x".repeat(81) })).toMatchObject({ ok: false, field: "title" }); expect(cleanConfig("deals", { title: "a\nb" })).toMatchObject({ ok: false, field: "title" });
  });
});
describe("resolveConfig", () => { it("fills defaults under stored values", () => { expect(resolveConfig("deals", { limit: 5 })).toMatchObject({ title: "Today’s deals", limit: 5 }); expect(resolveConfig("product_row", null).slugs).toEqual([]); }); });
describe("scheduling", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  it("is hidden when disabled, scheduled before its start, expired after its end, otherwise live", () => {
    expect(visibility({ enabled: false }, now)).toBe("hidden"); expect(visibility({ enabled: true, publishAt: "2026-11-02T00:00:00Z" }, now)).toBe("scheduled");
    expect(visibility({ enabled: true, unpublishAt: "2026-10-31T00:00:00Z" }, now)).toBe("expired"); expect(visibility({ enabled: true, publishAt: "2026-10-01T00:00:00Z", unpublishAt: "2026-12-01T00:00:00Z" }, now)).toBe("live"); expect(visibility({ enabled: true }, now)).toBe("live");
  });
  it("treats the end time as exclusive", () => expect(visibility({ enabled: true, unpublishAt: now }, now)).toBe("expired"));
});
describe("trust items", () => { it("parses up to four 'heading | text' lines", () => { const r = parseTrustItems("A | one\nB|two\n\nC\nD | four\nE | five"); expect(r).toEqual([{ heading: "A", text: "one" }, { heading: "B", text: "two" }, { heading: "C", text: "" }, { heading: "D", text: "four" }]); }); });
