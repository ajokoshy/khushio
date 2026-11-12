/**
 * Release 3A against a real Postgres: the categories, brands and merchants services and repositories
 * with the real SQL (unique indexes, LIKE escaping, counts, foreign keys). Only the Next.js cache calls
 * are stubbed. The database client is swapped for an embedded Postgres; no secrets are needed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq } from "drizzle-orm";
import { auditLogs, affiliateLinks, brands, categories, merchantPrograms, affiliateNetworks, productCategories, products, users } from "@/core/database/schema";
import * as discover from "@/modules/discover/service";
import * as merchants from "@/modules/merchants/service";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actor: string;

const catInput = (name: string, parentId: string | null = null, over = {}) => ({ name, slug: undefined, parentId, description: null, sortOrder: 0, confirmSlugChange: false, ...over });

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  const [u] = await t.db.insert(users).values({ email: "owner@khushio.test", passwordHash: "x" }).returning({ id: users.id });
  actor = u!.id;
}, 60_000);
afterAll(async () => t.client.close());

describe("categories (real SQL)", () => {
  it("builds a three-level tree with generated, unique slugs", async () => {
    const fashion = await discover.createCategory(catInput("Fashion"), actor);
    const shoes = await discover.createCategory(catInput("Shoes", fashion.id), actor);
    const running = await discover.createCategory(catInput("Running", shoes.id), actor);
    const topShoes = await discover.createCategory(catInput("Shoes"), actor); // same name, different parent: allowed
    expect([fashion.slug, shoes.slug, running.slug, topShoes.slug]).toEqual(["fashion", "shoes", "running", "shoes-2"]);

    const list = await discover.listCategories({ status: "all", limit: 50, offset: 0 });
    expect(list.rows.map((r) => [r.name, r.depth])).toEqual([["Fashion", 0], ["Shoes", 1], ["Running", 2], ["Shoes", 0]]);
    expect(list.rows[2]?.path).toBe("Fashion › Shoes › Running");
  });

  it("rejects the same name under the same parent, ignoring case, and writes an audit row for each create", async () => {
    const fashion = (await t.db.select().from(categories).where(eq(categories.slug, "fashion")))[0]!;
    await expect(discover.createCategory(catInput("SHOES", fashion.id), actor)).rejects.toMatchObject({ fields: { name: expect.any(String) } });
    const rows = await t.db.select().from(auditLogs).where(eq(auditLogs.action, "category.created"));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows[0]?.actorId).toBe(actor);
  });

  it("prevents cycles with real data, and allows a legal move", async () => {
    const [fashion, shoes, running] = await Promise.all(["fashion", "shoes", "running"].map(async (s) => (await t.db.select().from(categories).where(eq(categories.slug, s)))[0]!));
    await expect(discover.updateCategory(fashion!.id, catInput("Fashion", running!.id), actor)).rejects.toMatchObject({ fields: { parentId: expect.stringContaining("cannot be moved") } });
    await discover.updateCategory(running!.id, catInput("Running", fashion!.id), actor);
    expect((await discover.getCategory(running!.id)).category.parentId).toBe(fashion!.id);
    await discover.updateCategory(running!.id, catInput("Running", shoes!.id), actor); // put it back
  });

  it("archives only leaves, refuses to delete categories that have children or products, and deletes a free one", async () => {
    const bySlug = async (s: string) => (await t.db.select().from(categories).where(eq(categories.slug, s)))[0]!;
    const fashion = await bySlug("fashion");
    const running = await bySlug("running");

    await expect(discover.archiveCategory(fashion.id, actor)).rejects.toMatchObject({ status: 409 });
    await expect(discover.deleteCategory(fashion.id, actor)).rejects.toMatchObject({ status: 409 });

    const [p] = await t.db.insert(products).values({ slug: "trainer", name: "Trainer" }).returning({ id: products.id });
    await t.db.insert(productCategories).values({ productId: p!.id, categoryId: running.id, isPrimary: true });
    await expect(discover.deleteCategory(running.id, actor)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("1 product") });

    await discover.archiveCategory(running.id, actor); // archiving a category with products is fine
    expect((await bySlug("running")).isActive).toBe(false);
    expect((await discover.listParentOptions()).some((o) => o.id === running.id)).toBe(false);
    await discover.restoreCategory(running.id, actor);

    const free = await discover.createCategory(catInput("Temporary"), actor);
    await discover.deleteCategory(free.id, actor);
    expect(await t.db.select().from(categories).where(eq(categories.id, free.id))).toHaveLength(0);
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.action, "category.deleted"))).length).toBe(1);
  });

  it("changes a slug only when confirmed, and records old and new", async () => {
    const c = await discover.createCategory(catInput("Gadgets"), actor);
    await expect(discover.updateCategory(c.id, catInput("Gadgets", null, { slug: "tech" }), actor)).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
    await discover.updateCategory(c.id, catInput("Gadgets", null, { slug: "tech", confirmSlugChange: true }), actor);
    const logged = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, c.id))).find((r) => r.action === "category.updated");
    expect(logged?.metadata).toMatchObject({ slug: { from: "gadgets", to: "tech" } });
  });

  it("searches by name or slug, treating % and _ literally", async () => {
    await discover.createCategory(catInput("50%_Off"), actor);
    expect((await discover.listCategories({ q: "%", status: "all", limit: 50, offset: 0 })).rows.map((r) => r.name)).toEqual(["50%_Off"]);
    expect((await discover.listCategories({ q: "zzz", status: "all", limit: 50, offset: 0 })).rows).toEqual([]);
  });
});

describe("brands (real SQL)", () => {
  const input = (name: string, over = {}) => ({ name, slug: undefined, description: null, logoUrl: null, isFeatured: false, confirmSlugChange: false, ...over });

  it("creates, lists with search, status filter and paging", async () => {
    for (const n of ["Nike", "Adidas", "Puma"]) await discover.createBrand(input(n), actor);
    const page1 = await discover.listBrands({ status: "all", limit: 2, offset: 0 });
    expect(page1.rows.map((b) => b.name)).toEqual(["Adidas", "Nike"]);
    expect(page1.hasNext).toBe(true);
    expect((await discover.listBrands({ q: "pum", status: "all", limit: 10, offset: 0 })).rows.map((b) => b.name)).toEqual(["Puma"]);
    await expect(discover.createBrand(input("nike"), actor)).rejects.toMatchObject({ fields: { name: expect.any(String) } });
  });

  it("archives instead of deleting a brand that products use, and the product keeps its brand", async () => {
    const [nike] = await t.db.select().from(brands).where(eq(brands.slug, "nike"));
    await t.db.insert(products).values({ slug: "air", name: "Air", brandId: nike!.id });
    await expect(discover.deleteBrand(nike!.id, actor)).rejects.toMatchObject({ status: 409 });
    await discover.archiveBrand(nike!.id, actor);
    expect((await discover.listBrands({ status: "archived", limit: 10, offset: 0 })).rows.map((b) => b.slug)).toEqual(["nike"]);
    expect((await t.db.select().from(products).where(eq(products.slug, "air")))[0]?.brandId).toBe(nike!.id);
    await discover.restoreBrand(nike!.id, actor);

    const [puma] = await t.db.select().from(brands).where(eq(brands.slug, "puma"));
    await discover.deleteBrand(puma!.id, actor);
    expect(await t.db.select().from(brands).where(eq(brands.slug, "puma"))).toHaveLength(0);
  });
});

describe("merchants (real SQL)", () => {
  const input = (name: string, allowedDomains: string[], over = {}) => ({ name, slug: undefined, websiteUrl: null, allowedDomains, logoUrl: null, confirmSlugChange: false, ...over });

  it("stores allowed domains as a list and audits changes to them", async () => {
    const m = await merchants.createMerchant(input("Amazon India", ["amazon.in", "amzn.to"]), actor);
    expect((await merchants.getMerchant(m.id)).merchant.allowedDomains).toEqual(["amazon.in", "amzn.to"]);
    await merchants.updateMerchant(m.id, input("Amazon India", ["amazon.in", "www.amazon.in"]), actor);
    const log = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, m.id))).find((r) => r.action === "merchant.updated");
    expect(log?.metadata).toMatchObject({ domainsAdded: ["www.amazon.in"], domainsRemoved: ["amzn.to"] });
  });

  it("refuses to delete a merchant with an affiliate link or programme; archives instead", async () => {
    const m = await merchants.createMerchant(input("Flipkart", ["flipkart.com"]), actor);
    await t.db.insert(affiliateLinks).values({ slug: "fk-1", merchantId: m.id, destinationUrl: "https://www.flipkart.com/x" });
    await expect(merchants.deleteMerchant(m.id, actor)).rejects.toMatchObject({ status: 409 });
    await merchants.archiveMerchant(m.id, actor);
    expect((await merchants.listMerchants({ status: "archived", limit: 10, offset: 0 })).rows.map((r) => r.slug)).toEqual(["flipkart"]);

    const n = await merchants.createMerchant(input("Myntra", ["myntra.com"]), actor);
    const [net] = await t.db.insert(affiliateNetworks).values({ key: "cuelinks", name: "Cuelinks" }).returning({ id: affiliateNetworks.id });
    await t.db.insert(merchantPrograms).values({ merchantId: n.id, networkId: net!.id });
    await expect(merchants.deleteMerchant(n.id, actor)).rejects.toMatchObject({ status: 409 });

    const free = await merchants.createMerchant(input("Free shop", []), actor);
    await merchants.deleteMerchant(free.id, actor);
    expect((await merchants.listMerchants({ q: "free", status: "all", limit: 10, offset: 0 })).rows).toEqual([]);
  });
});
