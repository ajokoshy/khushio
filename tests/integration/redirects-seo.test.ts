/**
 * Release 7A against a real Postgres: automatic 301s on slug changes (atomic, flattened, loop-free), 410 on delete,
 * the manual rules with the no-chains rule, the sitemap (published and indexable only), search overrides, the SEO audit
 * and the media alt-text check. Only the Next.js cache is stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: () => undefined, revalidatePath: () => undefined, unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq } from "drizzle-orm";
import { brands, categories, mediaAssets, redirects, users } from "@/core/database/schema";
import * as discover from "@/modules/discover/service";
import * as content from "@/modules/content/service";
import { articleInputSchema, pageInputSchema, type ArticleInput } from "@/modules/content/validation";
import { buildMap, lookupRedirect } from "@/modules/redirects/path";
import * as repo from "@/modules/redirects/repository";
import * as redirectService from "@/modules/redirects/service";
import { redirectInputSchema } from "@/modules/redirects/validation";
import * as seo from "@/modules/seo/service";
import { seoOverrideSchema } from "@/modules/seo/validation";
import { countMissingAlt, listMedia } from "@/modules/media/service";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actorId: string;
const who = () => ({ actorId, canPublish: true, canEditSeo: true });
const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Some real text." }] }] });
const article = (over: Record<string, unknown> = {}): ArticleInput => articleInputSchema.parse({ title: "Piece", status: "PUBLISHED", content: body, ...over });
const rule = (input: { fromPath: string; toPath?: string; statusCode?: number }) => redirectInputSchema.parse({ statusCode: 301, ...input });
const rules = async () => Object.fromEntries((await repo.selectAllRules()).map((r) => [r.fromPath, `${r.statusCode}:${r.toPath ?? "-"}`]));
const catInput = (over: Record<string, unknown> = {}) => ({ name: "Shoes", slug: undefined, parentId: null, description: null, sortOrder: 0, confirmSlugChange: false, ...over }) as never;

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  actorId = (await t.db.insert(users).values({ email: "editor@khushio.test", passwordHash: "x" }).returning({ id: users.id }))[0]!.id;
}, 60_000);
afterAll(async () => t.client.close());

describe("automatic redirects on slug changes", () => {
  it("a published article whose slug changes gets a 301 from the old address, in the same write", async () => {
    const { id } = await content.createArticle(article({ title: "First name" }), who());
    await content.updateArticle(id, article({ title: "First name", slug: "second-name", confirmSlugChange: "on" }), who());
    expect((await rules())["/articles/first-name"]).toBe("301:/articles/second-name");
    expect((await content.getArticle(id)).article.slug).toBe("second-name");
  });

  it("a second change flattens: the first old address goes straight to the newest one, never through the middle", async () => {
    const found = (await t.db.query.articles.findFirst({ where: (a, { eq: e }) => e(a.slug, "second-name") }))!;
    await content.updateArticle(found.id, article({ title: "First name", slug: "third-name", confirmSlugChange: "on" }), who());
    const r = await rules();
    expect(r["/articles/first-name"]).toBe("301:/articles/third-name");
    expect(r["/articles/second-name"]).toBe("301:/articles/third-name");
  });

  it("going back to an old slug removes the rule for it (no loop), and the other old address follows", async () => {
    const found = (await t.db.query.articles.findFirst({ where: (a, { eq: e }) => e(a.slug, "third-name") }))!;
    await content.updateArticle(found.id, article({ title: "First name", slug: "first-name", confirmSlugChange: "on" }), who());
    const r = await rules();
    expect(r["/articles/first-name"]).toBeUndefined();
    expect(r["/articles/third-name"]).toBe("301:/articles/first-name");
    expect(r["/articles/second-name"]).toBe("301:/articles/first-name");
    const map = buildMap((await repo.selectAllRules()));
    for (const [from, rl] of map) expect(rl.toPath === null || !map.has(rl.toPath), `${from} must not chain`).toBe(true);
  });

  it("a draft that was never public needs no redirect when its slug changes", async () => {
    const { id } = await content.createArticle(article({ title: "Secret draft", status: "DRAFT" }), who());
    await content.updateArticle(id, article({ title: "Secret draft", status: "DRAFT", slug: "renamed-draft", confirmSlugChange: "on" }), who());
    expect((await rules())["/articles/secret-draft"]).toBeUndefined();
  });

  it("pages and categories too, and a category slug change keeps its row", async () => {
    const page = await content.createPage(pageInputSchema.parse({ title: "About", status: "PUBLISHED", content: body }), who());
    await content.updatePage(page.id, pageInputSchema.parse({ title: "About", status: "PUBLISHED", content: body, slug: "about-us", confirmSlugChange: "on" }), who());
    expect((await rules())["/p/about"]).toBe("301:/p/about-us");

    const cat = await discover.createCategory(catInput({ name: "Sandals" }), actorId);
    const moved = await discover.updateCategory(cat.id, catInput({ name: "Sandals", slug: "open-footwear", confirmSlugChange: true }), actorId);
    expect(moved.slug).toBe("open-footwear");
    expect((await rules())["/categories/sandals"]).toBe("301:/categories/open-footwear");
  });

  it("brands: changing a slug redirects, deleting leaves a 410, and a new brand on that address releases it", async () => {
    const brand = await discover.createBrand({ name: "Acme", slug: undefined, description: null, logoUrl: null, isFeatured: false, confirmSlugChange: false } as never, actorId);
    await discover.updateBrand(brand.id, { name: "Acme", slug: "acme-co", description: null, logoUrl: null, isFeatured: false, confirmSlugChange: true } as never, actorId);
    expect((await rules())["/brands/acme"]).toBe("301:/brands/acme-co");
    await discover.deleteBrand(brand.id, actorId);
    const r = await rules();
    expect(r["/brands/acme-co"]).toBe("410:-");
    expect(r["/brands/acme"]).toBe("410:-"); // the rule that led to it is gone too
    await discover.createBrand({ name: "Acme Co", slug: "acme-co", description: null, logoUrl: null, isFeatured: false, confirmSlugChange: false } as never, actorId);
    expect((await rules())["/brands/acme-co"]).toBeUndefined();
  });
});

describe("410 for removed pages", () => {
  it("deleting an archived article that was public leaves a 410; deleting a never-public draft does not", async () => {
    const { id } = await content.createArticle(article({ title: "Old news" }), who());
    await content.updateArticle(id, article({ title: "Old news", status: "ARCHIVED" }), who());
    await content.deleteArticle(id, who());
    expect((await rules())["/articles/old-news"]).toBe("410:-");

    const draft = await content.createArticle(article({ title: "Never seen", status: "DRAFT" }), who());
    await content.deleteArticle(draft.id, who());
    expect((await rules())["/articles/never-seen"]).toBeUndefined();
  });

  it("a new article on a removed address takes the address back (the 410 is released)", async () => {
    await content.createArticle(article({ title: "Old news" }), who());
    expect((await rules())["/articles/old-news"]).toBeUndefined();
  });
});

describe("manual rules", () => {
  it("creates, edits and deletes a rule, and every change is in the audit log", async () => {
    const id = await redirectService.createRule(rule({ fromPath: "/Legacy/Page/", toPath: "/p/about-us" }), actorId);
    expect((await rules())["/legacy/page"]).toBe("301:/p/about-us");
    await redirectService.updateRule(id, rule({ fromPath: "/legacy/page", toPath: "/p/about-us", statusCode: 302 }), actorId);
    expect((await rules())["/legacy/page"]).toBe("302:/p/about-us");
    await redirectService.deleteRule(id, actorId);
    expect((await rules())["/legacy/page"]).toBeUndefined();
    const actions = (await t.db.query.auditLogs.findMany()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["redirect.created", "redirect.updated", "redirect.deleted"]));
  });

  it("rejects chains, loops, the admin paths and a second rule for one address", async () => {
    await redirectService.createRule(rule({ fromPath: "/m/one", toPath: "/m/two" }), actorId);
    await expect(redirectService.createRule(rule({ fromPath: "/m/zero", toPath: "/m/one" }), actorId)).rejects.toMatchObject({ fields: { toPath: expect.stringContaining("/m/two") } });
    await expect(redirectService.createRule(rule({ fromPath: "/m/two", toPath: "/m/three" }), actorId)).rejects.toMatchObject({ fields: { fromPath: expect.any(String) } });
    await expect(redirectService.createRule(rule({ fromPath: "/m/two", toPath: "/m/one" }), actorId)).rejects.toMatchObject({ fields: { toPath: expect.stringContaining("loop") } });
    await expect(redirectService.createRule(rule({ fromPath: "/admin/x", toPath: "/m/9" }), actorId)).rejects.toMatchObject({ fields: { fromPath: expect.any(String) } });
    await expect(redirectService.createRule(rule({ fromPath: "/m/one", toPath: "/m/9" }), actorId)).rejects.toMatchObject({ fields: { fromPath: expect.any(String) } });
    expect(redirectInputSchema.safeParse({ fromPath: "https://evil.com/x", toPath: "/y", statusCode: "301" }).success).toBe(false);
  });

  it("a hand-made 410 needs no target", async () => {
    await redirectService.createRule(redirectInputSchema.parse({ fromPath: "/m/gone", toPath: "", statusCode: "410" }), actorId);
    expect((await rules())["/m/gone"]).toBe("410:-");
  });

  it("the lookup map answers from the stored rules", async () => {
    const map = buildMap(await repo.selectAllRules());
    expect(lookupRedirect(map, "/Categories/Sandals/")).toEqual({ toPath: "/categories/open-footwear", statusCode: 301 });
  });

  it("warns about a rule that hides a page which exists (for example one made by an import)", async () => {
    await t.db.insert(redirects).values({ fromPath: "/categories/open-footwear", toPath: "/m/two", statusCode: 301, source: "manual" });
    const shadowed = await redirectService.findShadowedRules();
    expect(shadowed.map((s) => s.page)).toContain("/categories/open-footwear");
    await t.db.delete(redirects).where(eq(redirects.fromPath, "/categories/open-footwear"));
    expect((await redirectService.findShadowedRules()).map((s) => s.page)).not.toContain("/categories/open-footwear");
  });
});

describe("the sitemap", () => {
  it("lists published, indexable pages only, and leaves out empty categories and brands", async () => {
    await content.createArticle(article({ title: "Visible one" }), who());
    await content.createArticle(article({ title: "Hidden by editor", seoRobots: "noindex,follow" }), who());
    await content.createArticle(article({ title: "Still a draft", status: "DRAFT" }), who());
    const urls = (kind: Parameters<typeof seo.getSitemapEntries>[0]) => seo.getSitemapEntries(kind).then((e) => e.map((x) => x.path));
    const articles = await urls("articles");
    expect(articles).toContain("/articles/visible-one");
    expect(articles).not.toContain("/articles/hidden-by-editor");
    expect(articles).not.toContain("/articles/still-a-draft");
    expect(await urls("categories")).not.toContain("/categories/open-footwear"); // no products, no subcategories: thin
    expect(await urls("brands")).not.toContain("/brands/acme-co");
    expect(await urls("static")).toEqual(expect.arrayContaining(["/", "/discover", "/deals"]));
  });

  it("a category with an active subcategory is not thin", async () => {
    const parent = await discover.createCategory(catInput({ name: "Outdoor" }), actorId);
    await discover.createCategory(catInput({ name: "Tents", parentId: parent.id }), actorId);
    expect((await seo.getSitemapEntries("categories")).map((e) => e.path)).toContain("/categories/outdoor");
  });

  it("plans one file for a small site", async () => {
    expect((await seo.getSitemapPlan()).plan.mode).toBe("single");
  });
});

describe("search overrides and the SEO audit", () => {
  it("saves a category's search fields, reads them back, and clearing every field removes the row", async () => {
    const cat = (await t.db.query.categories.findFirst({ where: (c, { eq: e }) => e(c.slug, "outdoor") }))!;
    await seo.saveOverride("category", cat.id, seoOverrideSchema.parse({ seoTitle: "Outdoor gear", seoDescription: "d".repeat(100) }), actorId);
    expect(await seo.getSeoOverride("category", cat.id)).toMatchObject({ title: "Outdoor gear" });
    await seo.saveOverride("category", cat.id, seoOverrideSchema.parse({}), actorId);
    expect(await seo.getSeoOverride("category", cat.id)).toBeNull();
    expect((await t.db.query.auditLogs.findMany()).filter((a) => a.action === "seo.updated").length).toBe(2);
  });

  it("refuses an unknown page", async () => {
    await expect(seo.saveOverride("category", "00000000-0000-4000-8000-000000000000", seoOverrideSchema.parse({ seoTitle: "x" }), actorId)).rejects.toThrow();
  });

  it("lists categories without a description of their own, and a written description clears the issue", async () => {
    const before = await seo.listAudit("category", { onlyIssues: true, limit: 50, offset: 0 });
    const outdoor = before.rows.find((r) => r.slug === "outdoor");
    expect(outdoor?.issues).toContain("no-own-description");
    const cat = (await t.db.query.categories.findFirst({ where: (c, { eq: e }) => e(c.slug, "outdoor") }))!;
    await seo.saveOverride("category", cat.id, seoOverrideSchema.parse({ seoDescription: "Tents, bags and everything else you need for nights outside, picked by the Khushio team." }), actorId);
    const after = await seo.listAudit("category", { onlyIssues: true, limit: 50, offset: 0 });
    expect(after.rows.find((r) => r.slug === "outdoor")).toBeUndefined();
    const all = await seo.listAudit("category", { onlyIssues: false, limit: 50, offset: 0 });
    expect(all.rows.find((r) => r.slug === "outdoor")?.overrideDescription).toContain("Tents");
    expect((await seo.countAuditIssues()).category).toBeGreaterThan(0);
  });

  it("deleting a category removes its search row", async () => {
    const c = await discover.createCategory(catInput({ name: "Temp" }), actorId);
    await seo.saveOverride("category", c.id, seoOverrideSchema.parse({ seoTitle: "Temp title" }), actorId);
    await discover.deleteCategory(c.id, actorId);
    expect(await seo.getSeoOverride("category", c.id)).toBeNull();
    expect((await rules())["/categories/temp"]).toBe("410:-");
  });
});

describe("media alt-text check", () => {
  it("counts and lists pictures without a description", async () => {
    await t.db.insert(mediaAssets).values([{ publicId: "khushio/products/with-alt", alt: "A red mug" }, { publicId: "khushio/products/no-alt-1" }, { publicId: "khushio/products/blank-alt", alt: "   " }]);
    expect(await countMissingAlt()).toBe(2);
    const { rows } = await listMedia({ usage: "no-alt", limit: 20, offset: 0 });
    expect(rows.map((r) => r.publicId).sort()).toEqual(["khushio/products/blank-alt", "khushio/products/no-alt-1"]);
  });
});

void brands;
void categories;
