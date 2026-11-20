/**
 * Release 6B against a real Postgres: guide types on the article table (default, filtering, the /guides lists, the sitemap)
 * and product embeds (live data in one query, hidden when the product is archived, draft or not yet live, the stored text
 * keeping only the id). Only the Next.js cache is stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: () => undefined, revalidatePath: () => undefined, unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq } from "drizzle-orm";
import { affiliateLinks, articles, merchants, products, productVariants, users } from "@/core/database/schema";
import { getEmbedProducts } from "@/modules/catalog/service";
import { collectProductIds } from "@/modules/content/document";
import * as pub from "@/modules/content/public";
import * as service from "@/modules/content/service";
import { GUIDE_TYPES } from "@/modules/content/types";
import { articleInputSchema, type ArticleInput } from "@/modules/content/validation";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actorId: string;
const publisher = () => ({ actorId, canPublish: true, canEditSeo: true });
const text = (s: string) => ({ type: "paragraph", content: [{ type: "text", text: s }] });
const body = (...blocks: unknown[]) => JSON.stringify({ type: "doc", content: [text("Intro."), ...blocks] });
const article = (over: Record<string, unknown> = {}): ArticleInput => articleInputSchema.parse({ title: "Some piece", status: "PUBLISHED", content: body(), ...over });

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  actorId = (await t.db.insert(users).values({ email: "editor@khushio.test", passwordHash: "x" }).returning({ id: users.id }))[0]!.id;
}, 60_000);
afterAll(async () => t.client.close());

describe("article types", () => {
  it("a form that sends no type makes a plain article; an unknown type is refused", async () => {
    expect(article().type).toBe("article");
    expect(articleInputSchema.safeParse({ title: "x", status: "DRAFT", content: body(), type: "podcast" }).success).toBe(false);
    const { id } = await service.createArticle(article({ title: "Plain" }), publisher());
    expect((await service.getArticle(id)).article.type).toBe("article");
  });

  it("stores the type, lists each guide kind on its own, keeps /guides to the guide kinds, and /articles shows everything", async () => {
    for (const type of ["guide", "review", "comparison", "how-to"]) await service.createArticle(article({ title: `A ${type}`, type }), publisher());
    await service.createArticle(article({ title: "A draft guide", type: "guide", status: "DRAFT" }), publisher());
    const slugs = async (types?: readonly (typeof GUIDE_TYPES)[number][]) => (await pub.getArticleListing({ page: 1, types })).articles.map((a) => a.slug);
    expect(await slugs([...GUIDE_TYPES])).toEqual(expect.arrayContaining(["a-guide", "a-review", "a-comparison", "a-how-to"]));
    expect(await slugs([...GUIDE_TYPES])).not.toContain("plain");
    expect(await slugs([...GUIDE_TYPES])).not.toContain("a-draft-guide");
    expect(await slugs(["review"])).toEqual(["a-review"]);
    expect(await slugs()).toEqual(expect.arrayContaining(["plain", "a-guide", "a-review"]));
    expect((await pub.getArticleListing({ page: 1, types: ["how-to"] })).articles[0]?.type).toBe("how-to");
  });

  it("knows which guide kinds have something visible, for the filter chips and the sitemap", async () => {
    expect(await pub.getGuideTypes()).toEqual(["guide", "review", "comparison", "how-to"]);
    const map = await pub.listSitemapContent(1000);
    expect(map.guideTypes).toEqual(["guide", "review", "comparison", "how-to"]);
    await t.db.update(articles).set({ status: "ARCHIVED" }).where(eq(articles.slug, "a-review"));
    expect(await pub.getGuideTypes()).toEqual(["guide", "comparison", "how-to"]);
  });

  it("a scheduled guide is not listed until its time, with no job", async () => {
    const future = new Date(Date.now() + 2 * 3_600_000);
    const { id } = await service.createArticle(article({ title: "Later guide", type: "guide", status: "DRAFT" }), publisher());
    await t.db.update(articles).set({ status: "SCHEDULED", publishAt: future }).where(eq(articles.id, id));
    expect((await pub.getArticleListing({ page: 1, types: ["guide"] })).articles.map((a) => a.slug)).not.toContain("later-guide");
    await t.db.update(articles).set({ publishAt: new Date(Date.now() - 1000) }).where(eq(articles.id, id));
    expect((await pub.getArticleListing({ page: 1, types: ["guide"] })).articles.map((a) => a.slug)).toContain("later-guide");
  });

  it("changing the type is saved and noted in the audit log", async () => {
    const { id } = await service.createArticle(article({ title: "Becomes a guide" }), publisher());
    await service.updateArticle(id, article({ title: "Becomes a guide", type: "guide" }), publisher());
    expect((await service.getArticle(id)).article.type).toBe("guide");
  });
});

describe("product embeds", () => {
  let live: string;
  let draft: string;
  let archived: string;
  let scheduled: string;
  let noStore: string;

  beforeAll(async () => {
    const [m] = await t.db.insert(merchants).values({ slug: "kart", name: "Kart", allowedDomains: ["kart.example"] }).returning({ id: merchants.id });
    const [off] = await t.db.insert(merchants).values({ slug: "closed", name: "Closed store", allowedDomains: ["closed.example"], isActive: false }).returning({ id: merchants.id });
    const mk = async (slug: string, status: "PUBLISHED" | "DRAFT" | "ARCHIVED" | "SCHEDULED", publishAt: Date | null = null) => (await t.db.insert(products).values({ slug, name: slug, status, publishAt }).returning({ id: products.id }))[0]!.id;
    live = await mk("embed-live", "PUBLISHED");
    draft = await mk("embed-draft", "DRAFT");
    archived = await mk("embed-archived", "ARCHIVED");
    scheduled = await mk("embed-scheduled", "SCHEDULED", new Date(Date.now() + 3_600_000));
    noStore = await mk("embed-nostore", "PUBLISHED");
    await t.db.insert(productVariants).values([{ productId: live, label: "S", priceMinor: 250_00 }, { productId: live, label: "L", priceMinor: 350_00 }]);
    await t.db.insert(affiliateLinks).values([
      { slug: "embed-live-kart", merchantId: m!.id, productId: live, destinationUrl: "https://kart.example/p/1" },
      { slug: "embed-nostore-closed", merchantId: off!.id, productId: noStore, destinationUrl: "https://closed.example/p/1" },
    ]);
  });

  it("returns live price range, store link and merchant for a product a visitor can see, in one call for all ids", async () => {
    const found = await getEmbedProducts([live, noStore]);
    expect(found.get(live)).toMatchObject({ slug: "embed-live", minPriceMinor: 250_00, maxPriceMinor: 350_00, linkSlug: "embed-live-kart", merchantName: "Kart" });
    // a link to a closed store is not offered
    expect(found.get(noStore)).toMatchObject({ linkSlug: null, merchantName: null });
  });

  it("leaves out draft, archived and not-yet-live products and ids that do not exist", async () => {
    const found = await getEmbedProducts([live, draft, archived, scheduled, "99999999-9999-4999-8999-999999999999"]);
    expect([...found.keys()]).toEqual([live]);
  });

  it("an archived product disappears from the embed at once, and a price change shows at once", async () => {
    await t.db.update(productVariants).set({ priceMinor: 199_00 }).where(eq(productVariants.label, "S"));
    expect((await getEmbedProducts([live])).get(live)?.minPriceMinor).toBe(199_00);
    await t.db.update(products).set({ status: "ARCHIVED" }).where(eq(products.id, live));
    expect((await getEmbedProducts([live])).size).toBe(0);
    await t.db.update(products).set({ status: "PUBLISHED" }).where(eq(products.id, live));
    expect((await getEmbedProducts([live])).size).toBe(1);
  });

  it("an empty list costs nothing and returns an empty map", async () => {
    expect((await getEmbedProducts([])).size).toBe(0);
  });

  it("the article keeps only the product id (the editor's label is dropped) and the page can list what it embeds", async () => {
    const content = body({ type: "productEmbed", attrs: { productId: live, label: "Embed live", note: "<script>x</script>" } }, { type: "productEmbed", attrs: { productId: "nope" } });
    const { slug } = await service.createArticle(article({ title: "With embed", type: "guide", content }), publisher());
    const read = await pub.getVisibleArticle(slug);
    expect(read).not.toBeNull();
    expect(JSON.stringify(read!.content)).not.toMatch(/Embed live|script|nope/);
    expect(collectProductIds(read!.content)).toEqual([live]);
    expect((await getEmbedProducts(collectProductIds(read!.content))).get(live)?.slug).toBe("embed-live");
  });
});
