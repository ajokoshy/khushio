import { describe, expect, it } from "vitest";
import { SEED_BRANDS, SEED_CATEGORIES, SEED_MERCHANTS, type SeedCategory } from "../../scripts/dev-seed-data";
import { SLUG_PATTERN } from "@/core/validation/slug";
import { parseAllowedDomains } from "@/modules/merchants/domains";

const walk = (nodes: SeedCategory[], depth = 1): { node: SeedCategory; depth: number }[] =>
  nodes.flatMap((n) => [{ node: n, depth }, ...walk(n.children ?? [], depth + 1)]);

describe("development seed data", () => {
  const all = walk(SEED_CATEGORIES);
  it("has a three-level category tree with valid, unique slugs", () => {
    expect(Math.max(...all.map((x) => x.depth))).toBe(3);
    const slugs = all.map((x) => x.node.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of [...slugs, ...SEED_BRANDS.map((b) => b.slug), ...SEED_MERCHANTS.map((m) => m.slug)]) expect(SLUG_PATTERN.test(s), s).toBe(true);
  });
  it("only uses merchant domains the allow-list rules accept", () => {
    for (const m of SEED_MERCHANTS) expect(parseAllowedDomains(m.allowedDomains.join("\n"))).toEqual({ domains: m.allowedDomains, errors: [] });
  });
});

import { generateSeedProducts } from "../../scripts/dev-seed-data";

describe("sample products", () => {
  const products = generateSeedProducts();
  const categorySlugs = new Set(walk(SEED_CATEGORIES).map((x) => x.node.slug));
  it("makes 60 products with unique slugs and SKUs, valid references and some drafts", () => {
    expect(products).toHaveLength(60);
    expect(new Set(products.map((p) => p.slug)).size).toBe(60);
    const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
    for (const p of products) {
      expect(SLUG_PATTERN.test(p.slug), p.slug).toBe(true);
      expect(categorySlugs.has(p.categorySlug), p.categorySlug).toBe(true);
      expect(SEED_BRANDS.some((b) => b.slug === p.brandSlug)).toBe(true);
      expect(p.variants.length).toBeGreaterThan(0);
    }
    expect(products.filter((p) => p.status === "DRAFT").length).toBe(6);
  });
});
