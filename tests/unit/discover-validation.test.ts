import { describe, expect, it } from "vitest";
import { brandInputSchema, categoryInputSchema, statusFilterSchema } from "@/modules/discover/validation";

describe("categoryInputSchema", () => {
  it("applies defaults for a minimal post", () => {
    expect(categoryInputSchema.parse({ name: "  Fashion " })).toEqual({
      name: "Fashion", slug: undefined, parentId: null, description: null, sortOrder: 0, confirmSlugChange: false,
    });
  });
  it("reads form strings", () => {
    const r = categoryInputSchema.parse({
      name: "Shoes", slug: " Mens-Shoes ", parentId: "3f2b8a0e-6c1d-4b7e-9a55-0d6f1c2e4a11", description: "d", sortOrder: "7", confirmSlugChange: "on",
    });
    expect(r).toMatchObject({ slug: "mens-shoes", parentId: "3f2b8a0e-6c1d-4b7e-9a55-0d6f1c2e4a11", sortOrder: 7, confirmSlugChange: true });
  });
  it("rejects bad input with field paths", () => {
    const r = categoryInputSchema.safeParse({ name: "", slug: "Bad Slug!", parentId: "nope", sortOrder: "-1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(["name", "parentId", "slug", "sortOrder"]);
  });
  it("rejects over-long text", () => {
    expect(categoryInputSchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ name: "ok", description: "x".repeat(501) }).success).toBe(false);
  });
});

describe("brandInputSchema", () => {
  it("parses checkbox and optional fields", () => {
    expect(brandInputSchema.parse({ name: "Nike", isFeatured: "on", logoUrl: "https://x.test/l.png" })).toMatchObject({ isFeatured: true, logoUrl: "https://x.test/l.png", description: null });
    expect(brandInputSchema.parse({ name: "Nike" }).isFeatured).toBe(false);
  });
});

describe("statusFilterSchema", () => {
  it("falls back to all for anything unknown", () => {
    expect(statusFilterSchema.parse("archived")).toBe("archived");
    expect(statusFilterSchema.parse("zzz")).toBe("all");
    expect(statusFilterSchema.parse(undefined)).toBe("all");
  });
});
