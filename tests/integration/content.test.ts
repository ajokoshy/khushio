/**
 * Release 6A against a real Postgres: article and page lifecycle, scheduled visibility by the database clock, who may
 * publish, slug rules, tags and SEO rows, topic and author deletion, media usage counting (cover and inline pictures),
 * the sitemap, and that every write clears the `articles` cache tag. Only the Next.js cache is stubbed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown, revalidated: [] as string[] }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: (t: string) => void holder.revalidated.push(t), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq } from "drizzle-orm";
import { articles, articleTags, auditLogs, contentTags, seoMetadata, users } from "@/core/database/schema";
import { ConflictError, ValidationError } from "@/core/errors";
import * as pub from "@/modules/content/public";
import * as repo from "@/modules/content/repository";
import * as service from "@/modules/content/service";
import { articleInputSchema, pageInputSchema, type ArticleInput, type PageInput } from "@/modules/content/validation";
import { deleteUnusedMedia, recordUpload } from "@/modules/media/service";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actorId: string;

const HOUR = 3_600_000;
const publisher = () => ({ actorId, canPublish: true, canEditSeo: true });
const writer = () => ({ actorId, canPublish: false, canEditSeo: false });
const text = (s: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: s }] }] });

function article(over: Record<string, unknown> = {}): ArticleInput {
  const parsed = articleInputSchema.parse({ title: "Best teas for winter", status: "DRAFT", content: JSON.stringify(text("Hot and sweet.")), ...over });
  return parsed;
}
function page(over: Record<string, unknown> = {}): PageInput {
  return pageInputSchema.parse({ title: "About us", status: "DRAFT", content: JSON.stringify(text("We help you shop.")), ...over });
}
const countRows = async (table: typeof articles | typeof articleTags | typeof seoMetadata) => (await t.db.select().from(table)).length;

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  actorId = (await t.db.insert(users).values({ email: "editor@khushio.test", passwordHash: "x" }).returning({ id: users.id }))[0]!.id;
}, 60_000);
afterAll(async () => t.client.close());
beforeEach(() => { holder.revalidated.length = 0; });

describe("articles: create, read, draft stays private", () => {
  it("creates a draft with a slug from the title, tags and SEO, and clears the cache tag", async () => {
    const { id, slug } = await service.createArticle(article({ tags: "Tea, Winter", seoTitle: "Winter teas", seoRobots: "noindex,follow" }), publisher());
    expect(slug).toBe("best-teas-for-winter");
    expect(holder.revalidated).toContain("articles");
    const got = await service.getArticle(id);
    expect(got.article.status).toBe("DRAFT");
    expect(got.tags.sort()).toEqual(["Tea", "Winter"]);
    expect(got.seo).toMatchObject({ title: "Winter teas", robots: "noindex,follow", description: null });
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, id)))[0]?.action).toBe("article.created");
    expect(await pub.getVisibleArticle(slug)).toBeNull();
    expect((await pub.getArticleListing({ page: 1 })).articles.map((a) => a.slug)).not.toContain(slug);
  });

  it("gives a second article with the same title the next free slug", async () => {
    const { slug } = await service.createArticle(article(), publisher());
    expect(slug).toBe("best-teas-for-winter-2");
  });

  it("refuses the slugs that the topic and tag pages use", async () => {
    await expect(service.createArticle(article({ title: "Category", slug: "category" }), publisher())).rejects.toMatchObject({ fields: { slug: expect.stringContaining("category") } });
    await expect(service.createArticle(article({ title: "Tag", slug: "tag" }), publisher())).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores only the cleaned document, whatever was posted", async () => {
    const hostile = { type: "doc", content: [{ type: "script", content: [{ type: "text", text: "alert(1)" }] }, { type: "paragraph", content: [{ type: "text", text: "ok", marks: [{ type: "link", attrs: { href: "javascript:alert(2)" } }] }] }] };
    const { id } = await service.createArticle(article({ title: "Clean me", content: JSON.stringify(hostile) }), publisher());
    const [row] = await t.db.select().from(articles).where(eq(articles.id, id));
    expect(JSON.stringify(row!.content)).not.toMatch(/script|alert|javascript/);
    expect(JSON.stringify(row!.content)).toContain("ok");
  });
});

describe("articles: publishing and scheduling by the clock", () => {
  it("a published article is visible, listed, and carries its tags and reading time", async () => {
    const { id, slug } = await service.createArticle(article({ title: "Visible one", tags: "Gifts", status: "PUBLISHED" }), publisher());
    const read = await pub.getVisibleArticle(slug);
    expect(read?.title).toBe("Visible one");
    expect(read?.tags.map((x) => x.name)).toEqual(["Gifts"]);
    expect(read?.readingMinutes).toBe(1);
    expect(read?.publishAt).toBeInstanceOf(Date);
    expect((await pub.getArticleListing({ page: 1 })).articles.map((a) => a.slug)).toContain(slug);
    const tag = await repo.selectTagBySlug("gifts");
    expect((await pub.getArticleListing({ page: 1, tagId: tag!.id })).articles.map((a) => a.slug)).toEqual([slug]);
    expect(id).toBeTruthy();
  });

  it("a scheduled article stays hidden until its time, with no job needed", async () => {
    const future = new Date(Date.now() + 2 * HOUR);
    await expect(service.createArticle(article({ title: "Later", status: "SCHEDULED" }), publisher())).rejects.toMatchObject({ fields: { publishAt: expect.stringContaining("date and time") } });

    const created = await service.createArticle({ ...article({ title: "Later two", status: "SCHEDULED" }), publishAt: future }, publisher());
    expect(await pub.getVisibleArticle(created.slug)).toBeNull();
    expect((await pub.getArticleListing({ page: 1 })).articles.map((a) => a.slug)).not.toContain(created.slug);

    // Created "an hour ago" with a go-live time 30 minutes ago: due now by the database clock, so it shows.
    const past = new Date(Date.now() - HOUR);
    const due = await service.createArticle({ ...article({ title: "Due now", status: "SCHEDULED" }), publishAt: new Date(past.getTime() + 30 * 60_000) }, publisher(), past);
    expect((await pub.getVisibleArticle(due.slug))?.title).toBe("Due now");
    expect((await pub.getArticleListing({ page: 1 })).articles.map((a) => a.slug)).toContain(due.slug);
  });

  it("refuses to publish or schedule an article with no text, a past go-live time, or a future time on Published", async () => {
    const empty = JSON.stringify({ type: "doc", content: [] });
    await expect(service.createArticle(article({ title: "Empty", status: "PUBLISHED", content: empty }), publisher())).rejects.toMatchObject({ fields: { status: expect.stringContaining("Write some text") } });
    await expect(service.createArticle({ ...article({ title: "Past", status: "SCHEDULED" }), publishAt: new Date(Date.now() - HOUR) }, publisher())).rejects.toMatchObject({ fields: { publishAt: expect.stringContaining("past") } });
    await expect(service.createArticle({ ...article({ title: "Soon", status: "PUBLISHED" }), publishAt: new Date(Date.now() + HOUR) }, publisher())).rejects.toMatchObject({ fields: { publishAt: expect.stringContaining("Scheduled") } });
    expect(await countRows(articles)).toBeGreaterThan(0);
  });

  it("archiving removes an article from the public site at once", async () => {
    const { id, slug } = await service.createArticle(article({ title: "To archive", status: "PUBLISHED" }), publisher());
    expect(await pub.getVisibleArticle(slug)).not.toBeNull();
    const { article: a } = await service.getArticle(id);
    await service.updateArticle(id, article({ title: a.title, status: "ARCHIVED" }), publisher());
    expect(await pub.getVisibleArticle(slug)).toBeNull();
  });
});

describe("articles: who may publish", () => {
  it("a writer can save drafts and send for review, but not publish, schedule or archive", async () => {
    const { id } = await service.createArticle(article({ title: "Writer draft" }), writer());
    await service.updateArticle(id, article({ title: "Writer draft", status: "REVIEW" }), writer());
    await expect(service.updateArticle(id, article({ title: "Writer draft", status: "PUBLISHED" }), writer())).rejects.toMatchObject({ fields: { status: expect.stringContaining("cannot publish") } });
    await expect(service.createArticle(article({ title: "Writer publish", status: "PUBLISHED" }), writer())).rejects.toBeInstanceOf(ValidationError);
  });

  it("a writer can edit the text of a live article but not pull it back to a draft", async () => {
    const { id, slug } = await service.createArticle(article({ title: "Live piece", status: "PUBLISHED" }), publisher());
    await service.updateArticle(id, article({ title: "Live piece", status: "PUBLISHED", content: JSON.stringify(text("Corrected text.")) }), writer());
    expect((await pub.getVisibleArticle(slug))?.content.content).toHaveLength(1);
    await expect(service.updateArticle(id, article({ title: "Live piece", status: "DRAFT" }), writer())).rejects.toMatchObject({ fields: { status: expect.stringContaining("cannot change") } });
  });

  it("without seo:write the search fields are left exactly as they were", async () => {
    const { id } = await service.createArticle(article({ title: "Seo guarded", seoTitle: "Keep me", seoRobots: "noindex,nofollow" }), publisher());
    await service.updateArticle(id, article({ title: "Seo guarded", excerpt: "New summary", seoTitle: "Overwritten?", seoRobots: "" }), writer());
    const got = await service.getArticle(id);
    expect(got.article.excerpt).toBe("New summary");
    expect(got.seo).toMatchObject({ title: "Keep me", robots: "noindex,nofollow" });
    const fresh = await service.createArticle(article({ title: "Writer new", seoTitle: "ignored" }), writer());
    expect((await service.getArticle(fresh.id)).seo.title).toBeNull();
  });

  it("clearing every search field removes the row", async () => {
    const { id } = await service.createArticle(article({ title: "Seo clear", seoTitle: "x" }), publisher());
    expect((await repo.selectSeo("article", id))?.title).toBe("x");
    await service.updateArticle(id, article({ title: "Seo clear" }), publisher());
    expect(await repo.selectSeo("article", id)).toBeNull();
  });
});

describe("articles: updating, slugs, deleting", () => {
  it("an update with nothing changed writes nothing (no audit row, no cache clear)", async () => {
    const { id } = await service.createArticle(article({ title: "No change", tags: "a" }), publisher());
    const before = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, id))).length;
    holder.revalidated.length = 0;
    await service.updateArticle(id, article({ title: "No change", tags: "A" }), publisher());
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, id))).length).toBe(before);
    expect(holder.revalidated).toEqual([]);
  });

  it("changes a slug only when confirmed, and never to a taken one", async () => {
    const a = await service.createArticle(article({ title: "Slug owner one" }), publisher());
    const b = await service.createArticle(article({ title: "Slug owner two" }), publisher());
    await expect(service.updateArticle(b.id, article({ title: "Slug owner two", slug: "renamed" }), publisher())).rejects.toBeInstanceOf(ValidationError);
    await expect(service.updateArticle(b.id, article({ title: "Slug owner two", slug: a.slug, confirmSlugChange: "on" }), publisher())).rejects.toBeInstanceOf(ValidationError);
    await service.updateArticle(b.id, article({ title: "Slug owner two", slug: "renamed", confirmSlugChange: "on" }), publisher());
    expect((await service.getArticle(b.id)).article.slug).toBe("renamed");
  });

  it("replaces the tag set, reusing a tag that exists (ignoring case)", async () => {
    const { id } = await service.createArticle(article({ title: "Tag swap", tags: "Alpha, Beta" }), publisher());
    await service.updateArticle(id, article({ title: "Tag swap", tags: "beta, Gamma" }), publisher());
    expect((await service.getArticle(id)).tags.sort()).toEqual(["Beta", "Gamma"]);
    expect((await t.db.select().from(contentTags).where(eq(contentTags.slug, "beta"))).length).toBe(1);
  });

  it("will not delete a live article, and deleting a draft removes its tags links and search row", async () => {
    const live = await service.createArticle(article({ title: "Live no delete", status: "PUBLISHED" }), publisher());
    await expect(service.deleteArticle(live.id, publisher())).rejects.toBeInstanceOf(ConflictError);
    const draft = await service.createArticle(article({ title: "Delete me", tags: "Temp", seoTitle: "x" }), publisher());
    await service.deleteArticle(draft.id, publisher());
    await expect(service.getArticle(draft.id)).rejects.toThrow();
    expect(await repo.selectSeo("article", draft.id)).toBeNull();
    expect((await t.db.select().from(articleTags).where(eq(articleTags.articleId, draft.id))).length).toBe(0);
    expect(holder.revalidated).toContain("articles");
  });
});

describe("authors, topics and tags", () => {
  it("shows the author and topic on a published article, and keeps the article when they are deleted", async () => {
    const authorId = await service.createAuthor({ displayName: "Asha Rao", slug: undefined, bio: "Writes about tea." }, actorId);
    const topicId = await service.createCategory({ name: "Tea guides", slug: undefined, description: "All about tea", sortOrder: 1, isActive: true }, actorId);
    const { slug, id } = await service.createArticle(article({ title: "Tea with author", status: "PUBLISHED", authorId, categoryId: topicId }), publisher());
    const read = await pub.getVisibleArticle(slug);
    expect(read).toMatchObject({ authorName: "Asha Rao", categoryName: "Tea guides", categorySlug: "tea-guides" });
    expect((await pub.getArticleTopics()).map((x) => x.slug)).toContain("tea-guides");
    const topic = await pub.getTopicBySlug("tea-guides");
    expect((await pub.getArticleListing({ page: 1, categoryId: topic!.id })).articles.map((a) => a.slug)).toEqual([slug]);

    await service.deleteAuthor(authorId, actorId);
    await service.deleteCategory(topicId, actorId);
    const after = await pub.getVisibleArticle(slug);
    expect(after?.authorName).toBeNull();
    expect(after?.categoryName).toBeNull();
    expect((await service.getArticle(id)).article.title).toBe("Tea with author");
  });

  it("a hidden topic has no page and no filter chip, and cannot be chosen for a new article", async () => {
    const topicId = await service.createCategory({ name: "Hidden topic", slug: undefined, description: null, sortOrder: 0, isActive: false }, actorId);
    expect(await pub.getTopicBySlug("hidden-topic")).toBeNull();
    expect((await pub.getArticleTopics()).map((x) => x.slug)).not.toContain("hidden-topic");
    await expect(service.createArticle(article({ title: "Into hidden", categoryId: topicId }), publisher())).rejects.toMatchObject({ fields: { categoryId: expect.any(String) } });
  });

  it("rejects an unknown author or topic, and duplicate topic or tag names", async () => {
    await expect(service.createArticle(article({ title: "Ghost author", authorId: crypto.randomUUID() }), publisher())).rejects.toBeInstanceOf(ValidationError);
    await service.createCategory({ name: "Unique topic", slug: undefined, description: null, sortOrder: 0, isActive: true }, actorId);
    await expect(service.createCategory({ name: "UNIQUE TOPIC", slug: undefined, description: null, sortOrder: 0, isActive: true }, actorId)).rejects.toBeInstanceOf(ValidationError);
    await service.createTag({ name: "Dupe tag", slug: undefined }, actorId);
    await expect(service.createTag({ name: "dupe tag", slug: undefined }, actorId)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("pages", () => {
  it("a published page is served by slug; a draft is not; archiving hides it", async () => {
    const draft = await service.createPage(page(), publisher());
    expect(await pub.getVisiblePage(draft.slug)).toBeNull();
    await service.updatePage(draft.id, page({ status: "PUBLISHED" }), publisher());
    expect((await pub.getVisiblePage(draft.slug))?.title).toBe("About us");
    await service.updatePage(draft.id, page({ status: "ARCHIVED" }), publisher());
    expect(await pub.getVisiblePage(draft.slug)).toBeNull();
    await service.deletePage(draft.id, publisher());
    await expect(service.getPage(draft.id)).rejects.toThrow();
  });

  it("a writer cannot publish a page", async () => {
    await expect(service.createPage(page({ title: "Writer page", status: "PUBLISHED" }), writer())).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("media usage and the sitemap", () => {
  it("a picture used as a cover or inside an article or page counts as used and can not be deleted", async () => {
    const mk = async (publicId: string) => (await recordUpload({ publicId, contentHash: null, width: 800, height: 600, bytes: 1000, alt: null }, actorId)).asset;
    const cover = await mk("khushio/products/cover-1");
    const inline = await mk("khushio/products/inline-1");
    const inPage = await mk("khushio/products/page-1");
    const free = await mk("khushio/products/free-1");
    const withImage = (id: string) => JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { publicId: id, alt: "x" } }] });
    await service.createArticle(article({ title: "Has cover", coverPublicId: "khushio/products/cover-1" }), publisher());
    await service.createArticle(article({ title: "Has inline", content: withImage("khushio/products/inline-1") }), publisher());
    await service.createPage(page({ title: "Has image", content: withImage("khushio/products/page-1") }), publisher());

    const { countImageUses } = await import("@/modules/media/repository");
    expect(await countImageUses("khushio/products/cover-1")).toBe(1);
    expect(await countImageUses("khushio/products/inline-1")).toBe(1);
    expect(await countImageUses("khushio/products/page-1")).toBe(1);
    expect(await countImageUses("khushio/products/free-1")).toBe(0);
    const destroyed: string[] = [];
    for (const m of [cover, inline, inPage]) await expect(deleteUnusedMedia(m.id, actorId, async (p) => { destroyed.push(p); return true; })).rejects.toBeInstanceOf(ConflictError);
    await deleteUnusedMedia(free.id, actorId, async (p) => { destroyed.push(p); return true; });
    expect(destroyed).toEqual(["khushio/products/free-1"]);
  });

  it("the sitemap lists visible articles and pages only, and leaves out anything kept out of search results", async () => {
    await service.createArticle(article({ title: "Sitemap yes", status: "PUBLISHED" }), publisher());
    await service.createArticle(article({ title: "Sitemap noindex", status: "PUBLISHED", seoRobots: "noindex,follow" }), publisher());
    await service.createArticle(article({ title: "Sitemap draft" }), publisher());
    const p = await service.createPage(page({ title: "Sitemap page", status: "PUBLISHED" }), publisher());
    const map = await pub.listSitemapContent(1000);
    const slugs = map.articles.map((a) => a.slug);
    expect(slugs).toContain("sitemap-yes");
    expect(slugs).not.toContain("sitemap-noindex");
    expect(slugs).not.toContain("sitemap-draft");
    expect(map.pages.map((x) => x.slug)).toContain(p.slug);
  });
});
