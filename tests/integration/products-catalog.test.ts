/**
 * Releases 3B and 3C against a real Postgres: products with variants, categories and images (atomic writes, SKU and
 * primary-category rules, image de-duplication), then the public catalogue (visibility, full-text search, typo
 * tolerance, filters, cursor pages). The database client is swapped for an embedded Postgres; Cloudinary is faked.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq, sql } from "drizzle-orm";
import { affiliateLinks, auditLogs, brands, mediaAssets, merchants, productCategories, productImages, products, productVariants, users } from "@/core/database/schema";
import * as discover from "@/modules/discover/service";
import * as catalog from "@/modules/catalog/service";
import * as catalogRepo from "@/modules/catalog/repository";
import { parseCatalogParams } from "@/modules/catalog/filters";
import * as service from "@/modules/products/service";
import { productInputSchema, type ProductInput } from "@/modules/products/validation";
import type { UploadResult } from "@/infrastructure/cloudinary/upload-rules";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actor: { id: string; permissions: string[] };
const writer = () => ({ id: actor.id, permissions: ["product:write"] as string[] });
let shoes: string;
let bags: string;
let acme: string;

const SECRET = "test-secret";
const removed: string[] = [];
const deps = { apiSecret: SECRET, removeFromCloudinary: async (id: string) => (removed.push(id), true) };
let imageCounter = 0;
function fakeUpload(over: Partial<UploadResult> = {}): UploadResult {
  imageCounter += 1;
  const base = { public_id: `khushio/products/img-${imageCounter}`, version: 1700000000 + imageCounter, width: 800, height: 600, bytes: 50_000, format: "jpg", resource_type: "image", etag: `etag${String(imageCounter).padStart(8, "0")}`, ...over };
  return { signature: createHash("sha1").update(`public_id=${base.public_id}&version=${base.version}${SECRET}`).digest("hex"), ...base };
}

function input(over: Record<string, unknown> = {}): ProductInput {
  return productInputSchema.parse({
    name: "Sample", status: "DRAFT", categoryIds: [], variants: [], attributes: [], tags: "", ...over,
  });
}

async function publishedProduct(name: string, over: Record<string, unknown> = {}) {
  const p = await service.createProduct(input({ name, primaryCategoryId: shoes, ...over }), actor);
  await service.addProductImage(p.id, fakeUpload(), `${name} photo`, actor, deps);
  return service.updateProduct(p.id, input({ name, primaryCategoryId: shoes, ...over, status: "PUBLISHED" }), actor);
}

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  const [u] = await t.db.insert(users).values({ email: "owner@khushio.test", passwordHash: "x" }).returning({ id: users.id });
  actor = { id: u!.id, permissions: ["product:write", "product:publish"] };
  const fashion = await discover.createCategory({ name: "Fashion", slug: undefined, parentId: null, description: null, sortOrder: 0, confirmSlugChange: false } as never, actor.id);
  shoes = (await discover.createCategory({ name: "Shoes", slug: undefined, parentId: fashion.id, description: null, sortOrder: 0, confirmSlugChange: false } as never, actor.id)).id;
  bags = (await discover.createCategory({ name: "Bags", slug: undefined, parentId: null, description: null, sortOrder: 0, confirmSlugChange: false } as never, actor.id)).id;
  acme = (await t.db.insert(brands).values({ name: "Acme", slug: "acme" }).returning({ id: brands.id }))[0]!.id;
}, 60_000);
afterAll(async () => t.client.close());

describe("products (3B)", () => {
  it("creates a draft with variants, categories, attributes and tags in one write", async () => {
    const p = await service.createProduct(
      input({ name: "Trail Runner", primaryCategoryId: shoes, categoryIds: [bags], brandId: acme, tags: "Running, Trail", attributes: [{ name: "Material", value: "Mesh" }], variants: [{ label: "Size 8", sku: "TR-8", currency: "INR", price: "3499" }, { label: "Size 9", sku: "TR-9", currency: "INR", price: "3499" }] }),
      actor,
    );
    expect(p.slug).toBe("trail-runner");
    const detail = await service.getProduct(p.id);
    expect(detail.primaryCategoryId).toBe(shoes);
    expect(detail.categoryIds.sort()).toEqual([shoes, bags].sort());
    expect(detail.variants.map((v) => [v.label, v.sortOrder])).toEqual([["Size 8", 0], ["Size 9", 1]]);
    expect(detail.tags).toEqual(["running", "trail"]);
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.action, "product.created"))).length).toBe(1);
  });

  it("refuses to create a product as published, and a writer cannot publish", async () => {
    await expect(service.createProduct(input({ name: "Live now", status: "PUBLISHED" }), actor)).rejects.toMatchObject({ fields: { status: expect.any(String) } });
    const p = await service.createProduct(input({ name: "Needs publisher", primaryCategoryId: shoes }), writer());
    await service.addProductImage(p.id, fakeUpload(), "x", writer(), deps);
    await expect(service.updateProduct(p.id, input({ name: "Needs publisher", primaryCategoryId: shoes, status: "PUBLISHED" }), writer())).rejects.toMatchObject({ fields: { status: expect.stringContaining("cannot publish") } });
  });

  it("will not publish without a main category or an image", async () => {
    const p = await service.createProduct(input({ name: "Bare" }), actor);
    await expect(service.updateProduct(p.id, input({ name: "Bare", status: "PUBLISHED" }), actor)).rejects.toMatchObject({ fields: { status: expect.stringContaining("main category") } });
    await expect(service.updateProduct(p.id, input({ name: "Bare", primaryCategoryId: shoes, status: "PUBLISHED" }), actor)).rejects.toMatchObject({ fields: { status: expect.stringContaining("image") } });
  });

  it("keeps SKUs unique across products", async () => {
    await expect(service.createProduct(input({ name: "Clash", variants: [{ label: "X", sku: "TR-8", currency: "INR", price: "1" }] }), actor)).rejects.toMatchObject({ fields: { "variants.0.sku": expect.any(String) } });
  });

  it("updates variants in place, adds new ones and deletes removed ones", async () => {
    const [p] = await t.db.select().from(products).where(eq(products.slug, "trail-runner"));
    const before = await service.getProduct(p!.id);
    const keep = before.variants[0]!;
    await service.updateProduct(p!.id, input({ name: "Trail Runner", primaryCategoryId: shoes, categoryIds: [bags], brandId: acme, variants: [{ id: keep.id, label: "Size 8 (new)", sku: "TR-8", currency: "INR", price: "3999" }, { label: "Size 10", sku: "TR-10", currency: "INR", price: "" }] }), actor);
    const after = await service.getProduct(p!.id);
    expect(after.variants.map((v) => v.label)).toEqual(["Size 8 (new)", "Size 10"]);
    expect(after.variants[0]!.id).toBe(keep.id);
    expect(after.variants[1]!.priceMinor).toBeNull();
  });

  it("allows only one primary category per product (database rule)", async () => {
    const [p] = await t.db.select().from(products).where(eq(products.slug, "trail-runner"));
    await expect(t.db.insert(productCategories).values({ productId: p!.id, categoryId: bags, isPrimary: true })).rejects.toThrow();
  });

  it("stores one picture once: a second upload of the same file reuses the first and removes the copy", async () => {
    const a = await service.createProduct(input({ name: "Photo A" }), actor);
    const b = await service.createProduct(input({ name: "Photo B" }), actor);
    const first = fakeUpload();
    await service.addProductImage(a.id, first, "A", actor, deps);
    const again = { ...fakeUpload(), etag: first.etag };
    const image = await service.addProductImage(b.id, again, "B", actor, deps);
    expect(image.publicId).toBe(first.public_id);
    expect(removed).toContain(again.public_id);
    expect((await t.db.select().from(mediaAssets).where(eq(mediaAssets.contentHash, first.etag!))).length).toBe(1);
  });

  it("rejects a forged or oversized upload and deletes the stray file", async () => {
    const p = await service.createProduct(input({ name: "Uploads" }), actor);
    await expect(service.addProductImage(p.id, { ...fakeUpload(), signature: "forged" }, null, actor, deps)).rejects.toMatchObject({ fields: { image: expect.any(String) } });
    const big = fakeUpload({ bytes: 9 * 1024 * 1024 });
    await expect(service.addProductImage(p.id, big, null, actor, deps)).rejects.toMatchObject({ fields: { image: expect.stringContaining("5 MB") } });
    expect(removed).toContain(big.public_id);
  });

  it("reorders images and keeps a published product's last image", async () => {
    const p = await publishedProduct("Gallery");
    await service.addProductImage(p.id, fakeUpload(), "second", actor, deps);
    const [first, second] = (await service.getProduct(p.id)).images;
    await service.moveProductImage(p.id, second!.id, "up", actor);
    expect((await service.getProduct(p.id)).images.map((i) => i.id)).toEqual([second!.id, first!.id]);
    await service.removeProductImage(p.id, first!.id, actor);
    await expect(service.removeProductImage(p.id, second!.id, actor)).rejects.toThrow(/at least one image/);
  });

  it("archives, restores as a draft, and refuses to delete live products or products with affiliate links", async () => {
    const p = await publishedProduct("Lifecycle");
    await expect(service.deleteProduct(p.id, actor)).rejects.toThrow(/Archive/);
    await service.archiveProduct(p.id, actor);
    expect((await service.getProduct(p.id)).product.status).toBe("ARCHIVED");
    await service.restoreProduct(p.id, actor);
    expect((await service.getProduct(p.id)).product.status).toBe("DRAFT");
    const [m] = await t.db.insert(merchants).values({ name: "Shop", slug: "shop", allowedDomains: ["shop.test"] }).returning({ id: merchants.id });
    await t.db.insert(affiliateLinks).values({ productId: p.id, merchantId: m!.id, slug: "life-1", destinationUrl: "https://shop.test/x" });
    await expect(service.deleteProduct(p.id, actor)).rejects.toThrow(/affiliate link/);
  });
});

describe("public catalogue (3C)", () => {
  const filters = (sp: Record<string, string> = {}) => parseCatalogParams(sp);
  const names = async (sp: Record<string, string> = {}, scope = {}) => (await catalog.listCatalog({ scope, filters: filters(sp) })).cards.map((c) => c.name);

  beforeAll(async () => {
    await publishedProduct("Aero Running Shoes", { brandId: acme, summary: "Light shoes for long runs", description: "Breathable mesh upper.", tags: "marathon", variants: [{ label: "One size", sku: "AERO-1", currency: "INR", price: "4500" }] });
    await publishedProduct("Canvas Tote", { primaryCategoryId: bags, description: "A sturdy bag. Pairs well with running shoes.", variants: [{ label: "Std", sku: "TOTE-1", currency: "INR", price: "999" }] });
    await publishedProduct("Budget Slip-ons", { variants: [{ label: "Std", sku: "SLIP-1", currency: "INR", price: "799" }, { label: "Wide", sku: "SLIP-2", currency: "INR", price: "899" }] });
    // A scheduled product whose time has passed is visible; one in the future is not.
    const past = await publishedProduct("Past Schedule");
    await t.db.update(products).set({ status: "SCHEDULED", publishAt: new Date(Date.now() - 3600_000) }).where(eq(products.id, past.id));
    const future = await publishedProduct("Future Schedule");
    await t.db.update(products).set({ status: "SCHEDULED", publishAt: new Date(Date.now() + 3600_000) }).where(eq(products.id, future.id));
  });

  it("never shows drafts, archived products or future-scheduled products", async () => {
    const all = await names();
    expect(all).toEqual(expect.arrayContaining(["Aero Running Shoes", "Canvas Tote", "Past Schedule"]));
    for (const hidden of ["Trail Runner", "Bare", "Future Schedule", "Lifecycle", "Photo A"]) expect(all).not.toContain(hidden);
    expect(await catalog.getProductPage("future-schedule")).toBeNull();
    expect(await catalog.getProductPage("trail-runner")).toBeNull();
    expect((await catalog.getProductPage("aero-running-shoes"))?.variants).toHaveLength(1);
  });

  it("ranks a name match above a description match", async () => {
    const found = await names({ q: "running shoes" });
    expect(found[0]).toBe("Aero Running Shoes");
    expect(found).toContain("Canvas Tote");
  });

  it("finds products by brand name and by tag", async () => {
    expect(await names({ q: "acme" })).toEqual(["Aero Running Shoes"]);
    expect(await names({ q: "marathon" })).toEqual(["Aero Running Shoes"]);
  });

  it("falls back to close matches for a typo", async () => {
    const page = await catalog.listCatalog({ scope: {}, filters: filters({ q: "Aero Runing Shos" }) });
    expect(page.fuzzy).toBe(true);
    expect(page.cards[0]?.name).toBe("Aero Running Shoes");
  });

  it("returns nothing, safely, for odd search text", async () => {
    expect(await names({ q: "zzzzqq" })).toEqual([]);
    expect(await names({ q: "'; drop table products; --" })).toEqual([]);
    expect(await names({ q: "100% & (weird) \"quote" })).toEqual([]);
  });

  it("filters by category (including subcategories), brand and price", async () => {
    const fashion = (await discover.getPublicCategory("fashion"))!;
    expect(await names({}, { categoryIds: fashion.scopeIds })).toEqual(expect.arrayContaining(["Aero Running Shoes", "Budget Slip-ons"]));
    expect(await names({}, { categoryIds: fashion.scopeIds })).not.toContain("Canvas Tote");
    expect(await names({ brand: "acme" })).toEqual(["Aero Running Shoes"]);
    expect(await names({ category: "bags" })).toEqual(["Canvas Tote"]);
    expect(await names({ min: "700", max: "1000" })).toEqual(["Budget Slip-ons"]);
    expect(await names({ min: "4000" })).toEqual(["Aero Running Shoes"]);
    expect(await names({ brand: "no-such-brand" })).toEqual([]);
  });

  it("shows the lowest price and a range marker on cards", async () => {
    const cards = (await catalog.listCatalog({ scope: {}, filters: filters() })).cards;
    const slip = cards.find((c) => c.name === "Budget Slip-ons")!;
    expect([slip.minPriceMinor, slip.maxPriceMinor]).toEqual([79900, 89900]);
    expect(slip.imagePublicId).toMatch(/^khushio\/products\//);
  });

  it("pages through every product exactly once with cursors, newest and A to Z", async () => {
    for (let i = 0; i < 12; i++) await publishedProduct(`Bulk ${String(i).padStart(2, "0")}`);
    for (const sort of ["new", "name"] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 20; guard++) {
        const query = { mode: "fts" as const, sort, cursor: null, limit: 5 };
        const decoded = cursor ? (await import("@/modules/catalog/cursor")).decodeCursor(cursor) : null;
        const page = await catalogRepo.selectCards({ ...query, cursor: decoded });
        seen.push(...page.cards.map((c) => c.id));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      const total = Number((await t.db.execute(sql`select count(*) as n from products where status = 'PUBLISHED' or (status = 'SCHEDULED' and publish_at <= now())`)).rows[0]!.n);
      expect(seen.length, sort).toBe(total);
      expect(new Set(seen).size, sort).toBe(total);
    }
  });

  it("pages search results by relevance without repeats", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const decoded = cursor ? (await import("@/modules/catalog/cursor")).decodeCursor(cursor) : null;
      const page = await catalogRepo.selectCards({ q: "bulk", mode: "fts", sort: "relevance", cursor: decoded, limit: 5 });
      seen.push(...page.cards.map((c) => c.name));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen.length).toBe(12);
    expect(new Set(seen).size).toBe(12);
  });

  it("lists a store's products through its active affiliate links", async () => {
    const [aero] = await t.db.select().from(products).where(eq(products.slug, "aero-running-shoes"));
    const [store] = await t.db.insert(merchants).values({ name: "Walk Store", slug: "walk-store", allowedDomains: ["walk.test"] }).returning({ id: merchants.id });
    await t.db.insert(affiliateLinks).values({ productId: aero!.id, merchantId: store!.id, slug: "aero-walk", destinationUrl: "https://walk.test/aero" });
    expect(await names({}, { merchantId: store!.id })).toEqual(["Aero Running Shoes"]);
    expect((await catalog.getProductPage("aero-running-shoes"))?.links).toEqual([{ slug: "aero-walk", merchantName: "Walk Store" }]);
  });

  it("suggests related products from the same category", async () => {
    const page = (await catalog.getProductPage("aero-running-shoes"))!;
    const related = await catalog.getRelatedProducts(page);
    expect(related.map((c) => c.name)).not.toContain("Aero Running Shoes");
    expect(related.length).toBeGreaterThan(0);
  });

  it("hides products again as soon as they are archived", async () => {
    const [tote] = await t.db.select().from(products).where(eq(products.slug, "canvas-tote"));
    await service.archiveProduct(tote!.id, actor);
    expect(await names({ q: "canvas tote" })).toEqual([]);
    expect(await catalog.getProductPage("canvas-tote")).toBeNull();
  });
});

describe("indexes serve the heavy queries", () => {
  it("uses the search and listing indexes once the table is large enough to matter", async () => {
    await t.db.execute(sql`insert into products (slug, name, status, summary) select 'gen-' || g, 'Generated product ' || g, 'PUBLISHED', 'filler text ' || g from generate_series(1, 3000) g`);
    await t.db.execute(sql`analyze products`);
    // With sequential scans switched off, the plan can only use an index that matches the query's expression: that is what is being proved.
    await t.db.execute(sql`set enable_seqscan = off`);
    const plan = async (q: string) => (await t.db.execute(sql.raw(`explain ${q}`))).rows.map((r) => String((r as Record<string, unknown>)["QUERY PLAN"])).join("\n");
    expect(await plan(`select id from products where search_vector @@ websearch_to_tsquery('english', 'zebra') limit 24`)).toMatch(/products_search_idx/);
    expect(await plan(`select id from products where lower(name) % 'generated prodct 5' limit 24`)).toMatch(/products_name_trgm_idx/);
    expect(await plan(`select id from products where status in ('PUBLISHED', 'SCHEDULED') order by created_at desc, id desc limit 24`)).toMatch(/products_listing_idx/);
    await t.db.execute(sql`reset enable_seqscan`);
  });
});
