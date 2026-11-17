/**
 * Release 5A against a real Postgres: the expiry boundary in SQL, scheduling, featured ordering, scope (store, product,
 * category and parent category), coupons, archived stores, bulk actions, and that every write clears the `deals` cache tag.
 * Only the Next.js cache is stubbed (unstable_cache runs the function every time).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown, revalidated: [] as string[] }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: (t: string) => void holder.revalidated.push(t), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq } from "drizzle-orm";
import { affiliateLinks, auditLogs, categories, deals, merchants, productCategories, products, users } from "@/core/database/schema";
import * as service from "@/modules/deals/service";
import * as pub from "@/modules/deals/public";
import * as repo from "@/modules/deals/repository";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actor: string;
let storeId: string;
let otherStoreId: string;
let phonesId: string; // parent category
let headphonesId: string; // child of phones
let productId: string;
let linkId: string;

const HOUR = 3_600_000;
const form = (over: Record<string, unknown> = {}) => ({
  title: "Sample deal", slug: undefined as string | undefined, merchantId: storeId, type: "deal" as const, description: null as string | null,
  affiliateLinkSlug: null as string | null, startsAt: null as Date | null, endsAt: null as Date | null, isFeatured: false, sortOrder: 0,
  status: "published" as const, productSlugs: [] as string[], categorySlugs: [] as string[], confirmSlugChange: false, ...over,
});
const coupon = (over: Record<string, unknown> = {}) => ({ merchantId: storeId, dealSlug: null as string | null, code: "SAVE10", discountType: "percent" as const, discountValue: 1000, currency: "INR" as const, minSpendMinor: null as number | null, startsAt: null as Date | null, endsAt: null as Date | null, isActive: true, ...over });
const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug);

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  actor = (await t.db.insert(users).values({ email: "owner@khushio.test", passwordHash: "x" }).returning({ id: users.id }))[0]!.id;
  storeId = (await t.db.insert(merchants).values({ slug: "amazon-india", name: "Amazon India", allowedDomains: ["amazon.in"] }).returning({ id: merchants.id }))[0]!.id;
  otherStoreId = (await t.db.insert(merchants).values({ slug: "flipkart", name: "Flipkart", allowedDomains: ["flipkart.com"] }).returning({ id: merchants.id }))[0]!.id;
  phonesId = (await t.db.insert(categories).values({ slug: "phones", name: "Phones" }).returning({ id: categories.id }))[0]!.id;
  headphonesId = (await t.db.insert(categories).values({ slug: "headphones", name: "Headphones", parentId: phonesId }).returning({ id: categories.id }))[0]!.id;
  productId = (await t.db.insert(products).values({ slug: "sony-xm5", name: "Sony XM5", status: "PUBLISHED" }).returning({ id: products.id }))[0]!.id;
  await t.db.insert(productCategories).values({ productId, categoryId: headphonesId, isPrimary: true });
  linkId = (await t.db.insert(affiliateLinks).values({ slug: "amazon-sony", merchantId: storeId, productId, destinationUrl: "https://www.amazon.in/dp/B0" }).returning({ id: affiliateLinks.id }))[0]!.id;
}, 60_000);
afterAll(async () => t.client.close());

async function clean() {
  await t.db.delete(deals);
  holder.revalidated.length = 0;
}

describe("the expiry rule in SQL", () => {
  it("shows an offer only between its start and end, judged by the database clock", async () => {
    await clean();
    const now = Date.now();
    const rows = [
      ["live", new Date(now - HOUR), new Date(now + HOUR), "published"],
      ["open-ended", new Date(now - HOUR), null, "published"],
      ["ended-1s-ago", new Date(now - 2 * HOUR), new Date(now - 1000), "published"],
      ["not-yet", new Date(now + 5 * 60_000 * 60), new Date(now + 9 * HOUR), "published"], // starts in 5 hours: beyond the look-ahead
      ["draft", new Date(now - HOUR), null, "draft"],
      ["archived", new Date(now - HOUR), null, "archived"],
    ] as const;
    for (const [slug, startsAt, endsAt, status] of rows) await t.db.insert(deals).values({ slug, title: slug, merchantId: storeId, startsAt, endsAt, status });
    const page = await repo.selectDealsPage();
    expect(slugs(page.deals).sort()).toEqual(["live", "open-ended"]);
  });

  it("includes an offer that starts within the look-ahead, and the render-time clock then decides", async () => {
    await clean();
    const now = Date.now();
    await t.db.insert(deals).values({ slug: "soon", title: "soon", merchantId: storeId, startsAt: new Date(now + 10 * 60_000), status: "published" });
    expect(slugs((await repo.selectDealsPage()).deals)).toEqual(["soon"]);
    expect(slugs((await pub.getDealsPage(new Date(now))).deals)).toEqual([]); // not started yet at "now"
    expect(slugs((await pub.getDealsPage(new Date(now + 11 * 60_000))).deals)).toEqual(["soon"]); // started 1 minute ago
  });

  it("drops an offer that ended after the list was built (stale cache)", async () => {
    await clean();
    const now = Date.now();
    await t.db.insert(deals).values({ slug: "ending", title: "ending", merchantId: storeId, startsAt: new Date(now - HOUR), endsAt: new Date(now + 60_000), status: "published" });
    const cached = await repo.selectDealsPage();
    expect(slugs(cached.deals)).toEqual(["ending"]);
    expect(pub.liveDeals(cached.deals, new Date(now + 61_000))).toEqual([]);
  });

  it("never shows offers of an archived store", async () => {
    await clean();
    await t.db.insert(deals).values({ slug: "x", title: "x", merchantId: storeId, status: "published" });
    await t.db.update(merchants).set({ isActive: false }).where(eq(merchants.id, storeId));
    expect((await repo.selectDealsPage()).deals).toEqual([]);
    await t.db.update(merchants).set({ isActive: true }).where(eq(merchants.id, storeId));
    expect((await repo.selectDealsPage()).deals).toHaveLength(1);
  });
});

describe("ordering and featuring", () => {
  it("lists featured first, then the manual order, then the newest start", async () => {
    await clean();
    const now = Date.now();
    const base = { merchantId: storeId, status: "published", startsAt: new Date(now - HOUR) };
    await t.db.insert(deals).values([
      { ...base, slug: "c", title: "c", sortOrder: 1 },
      { ...base, slug: "a", title: "a", sortOrder: 5, isFeatured: true },
      { ...base, slug: "b", title: "b", sortOrder: 0 },
      { ...base, slug: "d", title: "d", sortOrder: 1, startsAt: new Date(now - 2 * HOUR) },
    ]);
    expect(slugs((await repo.selectDealsPage()).deals)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("scope on a product page", () => {
  it("shows product offers, offers on the product's category or its parent, and store-wide offers of stores that sell it", async () => {
    await clean();
    const mk = async (over: Record<string, unknown>) => service.createDeal(form(over), actor);
    await mk({ title: "For this product", productSlugs: ["sony-xm5"] });
    await mk({ title: "For headphones", categorySlugs: ["headphones"] });
    await mk({ title: "For phones parent", categorySlugs: ["phones"] });
    await mk({ title: "Store wide" });
    await mk({ title: "Other store wide", merchantId: otherStoreId });
    await mk({ title: "Other product", productSlugs: [] , categorySlugs: ["phones"], merchantId: otherStoreId });
    await t.db.insert(products).values({ slug: "unrelated", name: "Unrelated", status: "PUBLISHED" });
    await mk({ title: "Unrelated product only", productSlugs: ["unrelated"] });
    const found = (await repo.selectDealsForProduct(productId)).map((d) => d.title).sort();
    expect(found).toEqual(["For headphones", "For phones parent", "For this product", "Other product", "Store wide"].sort());
  });

  it("does not show a store-wide offer of a store with no active link to the product", async () => {
    await t.db.update(affiliateLinks).set({ isActive: false }).where(eq(affiliateLinks.id, linkId));
    expect((await repo.selectDealsForProduct(productId)).map((d) => d.title)).not.toContain("Store wide");
    await t.db.update(affiliateLinks).set({ isActive: true }).where(eq(affiliateLinks.id, linkId));
  });

  it("the store page lists every live offer of that store", async () => {
    expect((await repo.selectDealsForMerchant(storeId)).map((d) => d.title).sort()).toEqual(["For headphones", "For phones parent", "For this product", "Store wide", "Unrelated product only"]);
  });
});

describe("creating and editing deals", () => {
  it("generates a slug, defaults the start to now, audits and clears the deals cache", async () => {
    await clean();
    const now = new Date("2026-12-01T10:00:00Z");
    const created = await service.createDeal(form({ title: "Big Sale" }), actor, now);
    expect(created.slug).toBe("big-sale");
    expect((await service.createDeal(form({ title: "Big Sale" }), actor, now)).slug).toBe("big-sale-2");
    const row = (await t.db.select().from(deals).where(eq(deals.slug, "big-sale")))[0];
    expect(row?.startsAt.toISOString()).toBe(now.toISOString());
    expect(holder.revalidated).toContain("deals");
    const log = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id)))[0];
    expect(log).toMatchObject({ action: "deal.created", actorId: actor });
  });

  it("refuses an end before the start, an unknown product, a link of another store and an archived store", async () => {
    await expect(service.createDeal(form({ startsAt: new Date("2026-12-02T00:00:00Z"), endsAt: new Date("2026-12-01T00:00:00Z") }), actor)).rejects.toMatchObject({ fields: { endsAt: expect.any(String) } });
    await expect(service.createDeal(form({ productSlugs: ["nope"] }), actor)).rejects.toMatchObject({ fields: { productSlugs: expect.any(String) } });
    await expect(service.createDeal(form({ categorySlugs: ["nope"] }), actor)).rejects.toMatchObject({ fields: { categorySlugs: expect.any(String) } });
    await expect(service.createDeal(form({ affiliateLinkSlug: "nope" }), actor)).rejects.toMatchObject({ fields: { affiliateLinkSlug: expect.any(String) } });
    await expect(service.createDeal(form({ merchantId: otherStoreId, affiliateLinkSlug: "amazon-sony" }), actor)).rejects.toMatchObject({ fields: { affiliateLinkSlug: expect.any(String) } });
    await t.db.update(merchants).set({ isActive: false }).where(eq(merchants.id, otherStoreId));
    await expect(service.createDeal(form({ merchantId: otherStoreId }), actor)).rejects.toMatchObject({ fields: { merchantId: expect.any(String) } });
    await t.db.update(merchants).set({ isActive: true }).where(eq(merchants.id, otherStoreId));
  });

  it("an edit keeps the start when it is left empty, replaces products and categories, and does nothing when nothing changed", async () => {
    await clean();
    const { id } = await service.createDeal(form({ title: "Edit me", productSlugs: ["sony-xm5"], startsAt: new Date("2026-12-01T00:00:00Z") }), actor);
    holder.revalidated.length = 0;
    await service.updateDeal(id, form({ title: "Edit me", productSlugs: ["sony-xm5"] }), actor);
    expect(holder.revalidated).toEqual([]);
    await service.updateDeal(id, form({ title: "Edited", productSlugs: [], categorySlugs: ["headphones"] }), actor);
    const got = await service.getDeal(id);
    expect(got.deal.title).toBe("Edited");
    expect(got.deal.startsAt.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(got.productSlugs).toEqual([]);
    expect(got.categorySlugs).toEqual(["headphones"]);
    expect(holder.revalidated).toContain("deals");
  });

  it("a slug changes only when confirmed", async () => {
    const { id } = await service.createDeal(form({ title: "Slug test" }), actor);
    await expect(service.updateDeal(id, form({ title: "Slug test", slug: "new-slug" }), actor)).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
    await service.updateDeal(id, form({ title: "Slug test", slug: "new-slug", confirmSlugChange: true }), actor);
    expect((await service.getDeal(id)).deal.slug).toBe("new-slug");
  });

  it("deleting a deal removes its coupons", async () => {
    const { id, slug } = await service.createDeal(form({ title: "Doomed" }), actor);
    await service.createCoupon(coupon({ code: "DOOMED1", dealSlug: slug }), actor);
    await service.deleteDeal(id, actor);
    expect((await repo.selectCoupons({ limit: 50, offset: 0 })).some((c) => c.code === "DOOMED1")).toBe(false);
  });
});

describe("bulk actions", () => {
  it("feature and unfeature only change what needs changing", async () => {
    await clean();
    const a = await service.createDeal(form({ title: "A" }), actor);
    const b = await service.createDeal(form({ title: "B", isFeatured: true }), actor);
    expect(await service.setFeatured([a.id, b.id], true, actor)).toBe(1);
    expect(await service.setFeatured([a.id, b.id], false, actor)).toBe(2);
  });

  it("end now ends published, running deals at the database clock, and leaves drafts and ended deals alone", async () => {
    await clean();
    const now = Date.now();
    const running = await service.createDeal(form({ title: "Running", startsAt: new Date(now - HOUR) }), actor);
    const future = await service.createDeal(form({ title: "Future", startsAt: new Date(now + 3 * HOUR) }), actor);
    const draft = await service.createDeal(form({ title: "Draft", status: "draft" }), actor);
    const ended = await service.createDeal(form({ title: "Ended", startsAt: new Date(now - 3 * HOUR), endsAt: new Date(now - HOUR) }), actor);
    expect(await service.expireNow([running.id, future.id, draft.id, ended.id], actor)).toBe(2);
    const state = async (id: string) => (await service.getDeal(id)).deal;
    expect((await state(running.id)).endsAt!.getTime()).toBeLessThanOrEqual(Date.now());
    const f = await state(future.id);
    expect(f.endsAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(f.startsAt.getTime()).toBeLessThanOrEqual(f.endsAt!.getTime()); // never ends before it begins
    expect((await state(draft.id)).endsAt).toBeNull();
    expect((await state(ended.id)).endsAt!.getTime()).toBe(now - HOUR);
    expect(await repo.selectDealsPage()).toMatchObject({ deals: [] });
  });

  it("archive hides, and saving the order writes every number", async () => {
    await clean();
    const a = await service.createDeal(form({ title: "A2" }), actor);
    const b = await service.createDeal(form({ title: "B2" }), actor);
    expect(await service.archiveMany([a.id], actor)).toBe(1);
    expect(await service.archiveMany([a.id], actor)).toBe(0);
    await service.saveOrder([{ id: b.id, sortOrder: 7 }], actor);
    expect((await service.getDeal(b.id)).deal.sortOrder).toBe(7);
    await expect(service.saveOrder([{ id: b.id, sortOrder: 10000 }], actor)).rejects.toMatchObject({ fields: { order: expect.any(String) } });
  });

  it("the state filter on the admin list matches the rule", async () => {
    await clean();
    const now = Date.now();
    for (const [slug, startsAt, endsAt, status] of [["l", now - HOUR, now + HOUR, "published"], ["s", now + HOUR, null, "published"], ["e", now - 2 * HOUR, now - HOUR, "published"], ["d", now - HOUR, null, "draft"], ["a", now - HOUR, null, "archived"]] as const) {
      await t.db.insert(deals).values({ slug, title: slug, merchantId: storeId, startsAt: new Date(startsAt), endsAt: endsAt ? new Date(endsAt) : null, status });
    }
    const by = async (state: "all" | "live" | "scheduled" | "expired" | "draft" | "archived") => slugs(await repo.selectDeals({ state, limit: 50, offset: 0 })).sort();
    expect(await by("all")).toEqual(["a", "d", "e", "l", "s"]);
    expect(await by("live")).toEqual(["l"]);
    expect(await by("scheduled")).toEqual(["s"]);
    expect(await by("expired")).toEqual(["e"]);
    expect(await by("draft")).toEqual(["d"]);
    expect(await by("archived")).toEqual(["a"]);
  });
});

describe("coupons", () => {
  it("appear inside their live deal only while they are active and inside their own dates, and stand-alone coupons are listed separately", async () => {
    await clean();
    const now = Date.now();
    const d = await service.createDeal(form({ title: "With codes" }), actor);
    await service.createCoupon(coupon({ code: "GOOD", dealSlug: d.slug }), actor);
    await service.createCoupon(coupon({ code: "OLD", dealSlug: d.slug, startsAt: new Date(now - 3 * HOUR), endsAt: new Date(now - HOUR) }), actor);
    await service.createCoupon(coupon({ code: "OFF", dealSlug: d.slug, isActive: false }), actor);
    await service.createCoupon(coupon({ code: "ALONE" }), actor);
    const page = await pub.getDealsPage();
    expect(page.deals[0]?.coupons.map((c) => c.code)).toEqual(["GOOD"]);
    expect(page.coupons.map((c) => c.code)).toContain("ALONE");
  });

  it("refuse a duplicate code for a store, a deal of another store and an unknown deal", async () => {
    await service.createCoupon(coupon({ code: "ONCE" }), actor);
    await expect(service.createCoupon(coupon({ code: "once" }), actor)).rejects.toMatchObject({ fields: { code: expect.any(String) } });
    const other = await service.createDeal(form({ title: "Other store deal", merchantId: otherStoreId }), actor);
    await expect(service.createCoupon(coupon({ code: "MIXED", dealSlug: other.slug }), actor)).rejects.toMatchObject({ fields: { dealSlug: expect.any(String) } });
    await expect(service.createCoupon(coupon({ code: "NODEAL", dealSlug: "nope" }), actor)).rejects.toMatchObject({ fields: { dealSlug: expect.any(String) } });
  });

  it("can be edited and deleted, and each change clears the cache", async () => {
    const c = await service.createCoupon(coupon({ code: "EDITME" }), actor);
    holder.revalidated.length = 0;
    await service.updateCoupon(c.id, coupon({ code: "EDITME", discountValue: 2000 }), actor);
    expect((await service.getCoupon(c.id)).discountValue).toBe(2000);
    await service.deleteCoupon(c.id, actor);
    expect(holder.revalidated.filter((t) => t === "deals")).toHaveLength(2);
    await expect(service.getCoupon(c.id)).rejects.toMatchObject({ status: 404 });
  });
});
