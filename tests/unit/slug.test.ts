import { describe, expect, it } from "vitest";
import { pickUniqueSlug, SLUG_MAX_LENGTH, SLUG_PATTERN, slugify, uniqueViolationOf } from "@/core/validation/slug";
import { resolveCreateSlug, resolveUpdateSlug } from "@/core/validation/slug-rules";
import { ValidationError } from "@/core/errors";

describe("slugify", () => {
  it("makes clean slugs", () => {
    expect(slugify("Home & Kitchen")).toBe("home-and-kitchen");
    expect(slugify("  Men's   Shoes!! ")).toBe("mens-shoes");
    expect(slugify("Café Crème")).toBe("cafe-creme");
    expect(slugify("A--B__C")).toBe("a-b-c");
  });
  it("returns empty when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("किताबें")).toBe("");
  });
  it("always matches the slug pattern and respects the length limit", () => {
    const s = slugify("word ".repeat(60));
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(SLUG_PATTERN.test(s)).toBe(true);
  });
});

describe("pickUniqueSlug", () => {
  it("uses the base when free, then -2, -3 ...", () => {
    expect(pickUniqueSlug("shoes", new Set())).toBe("shoes");
    expect(pickUniqueSlug("shoes", new Set(["shoes"]))).toBe("shoes-2");
    expect(pickUniqueSlug("shoes", new Set(["shoes", "shoes-2", "shoes-3"]))).toBe("shoes-4");
  });
  it("keeps the result within the limit", () => {
    const base = "a".repeat(SLUG_MAX_LENGTH);
    const out = pickUniqueSlug(base, new Set([base]));
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(out.endsWith("-2")).toBe(true);
  });
});

describe("uniqueViolationOf", () => {
  it("reads the constraint from the error or its cause", () => {
    expect(uniqueViolationOf({ code: "23505", constraint: "categories_slug_unique" })).toBe("categories_slug_unique");
    expect(uniqueViolationOf(new Error("wrapped", { cause: { code: "23505", constraint: "x_uq" } }))).toBe("x_uq");
    expect(uniqueViolationOf({ code: "23503" })).toBeNull();
    expect(uniqueViolationOf(null)).toBeNull();
  });
});

describe("slug rules", () => {
  const taken = (list: string[]) => async (base: string) => list.filter((s) => s === base || s.startsWith(`${base}-`));

  it("create: generates from the name and avoids clashes", async () => {
    expect(await resolveCreateSlug({ name: "Home & Kitchen", findTaken: taken([]) })).toBe("home-and-kitchen");
    expect(await resolveCreateSlug({ name: "Shoes", findTaken: taken(["shoes", "shoes-2"]) })).toBe("shoes-3");
  });
  it("create: an explicit slug must be free", async () => {
    await expect(resolveCreateSlug({ name: "X", explicit: "shoes", findTaken: taken(["shoes"]) })).rejects.toBeInstanceOf(ValidationError);
    expect(await resolveCreateSlug({ name: "X", explicit: "shoes", findTaken: taken(["shoes-2"]) })).toBe("shoes");
  });
  it("create: asks for a slug when the name gives none", async () => {
    await expect(resolveCreateSlug({ name: "!!!", findTaken: taken([]) })).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
  });
  it("update: never changes silently", async () => {
    expect(await resolveUpdateSlug({ current: "a", requested: undefined, confirmed: false, findTaken: taken([]) })).toBe("a");
    expect(await resolveUpdateSlug({ current: "a", requested: "a", confirmed: false, findTaken: taken([]) })).toBe("a");
    await expect(resolveUpdateSlug({ current: "a", requested: "b", confirmed: false, findTaken: taken([]) })).rejects.toMatchObject({ fields: { slug: expect.stringContaining("Tick the box") } });
  });
  it("update: a confirmed change must still be free", async () => {
    expect(await resolveUpdateSlug({ current: "a", requested: "b", confirmed: true, findTaken: taken([]) })).toBe("b");
    await expect(resolveUpdateSlug({ current: "a", requested: "b", confirmed: true, findTaken: taken(["b"]) })).rejects.toBeInstanceOf(ValidationError);
  });
});
