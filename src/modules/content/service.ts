import { revalidateTag } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { slugify, uniqueViolationOf } from "@/core/validation/slug";
import { resolveCreateSlug, resolveUpdateSlug } from "@/core/validation/slug-rules";
import * as repo from "./repository";
import { resolvePublishing, statusChangeProblem } from "./rules";
import { EMPTY_SEO, RESERVED_ARTICLE_SLUGS, type ArticleListRow, type ArticleRow, type ArticleWrite, type ContentFilter, type PageListRow, type PageRow, type PageWrite, type SeoFields, type TypeFilter } from "./types";
import type { ArticleInput, AuthorInput, CategoryInput, PageInput, TagInput } from "./validation";

/**
 * Admin rules for articles, pages, authors, topics and tags (Release 6A). Every write: validated input (by the caller),
 * permission checked by the server action, business rules here, one atomic write, an audit row, and
 * revalidateTag("articles") so the public pages refresh at once. Public reads are in public.ts.
 *
 * Who may do what (the caller passes these two flags from the session):
 *   canPublish  content:publish  publish, schedule, archive, and pull live content back
 *   canEditSeo  seo:write        change the search fields; without it they are left exactly as they were
 */

export type Who = { actorId: string; canPublish: boolean; canEditSeo: boolean };

const touch = () => revalidateTag(CACHE_TAGS.articles);
const page = <T>(rows: T[], limit: number) => ({ rows: rows.slice(0, limit), hasNext: rows.length > limit });

const seoOf = (input: ArticleInput | PageInput): SeoFields => ({ title: input.seoTitle, description: input.seoDescription, canonical: input.seoCanonical, ogImage: input.seoOgImage, robots: input.seoRobots });
const sameSeo = (a: SeoFields, b: SeoFields) => (Object.keys(a) as (keyof SeoFields)[]).every((k) => a[k] === b[k]);
const when = (d: Date | null) => (d ? d.getTime() : null);

function slugTaken(error: unknown): never {
  if (uniqueViolationOf(error)) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
  throw error;
}

function failIf(problems: string[], field: string): void {
  if (problems.length > 0) throw new ValidationError("Not ready to publish", { [field]: problems.join(" ") });
}

/* ================================== articles ================================== */

export async function listArticles(opts: { q?: string; status: ContentFilter; type?: TypeFilter; limit: number; offset: number }) {
  return page(await repo.selectArticles({ ...opts, limit: opts.limit + 1 }), opts.limit);
}

export async function getArticle(id: string): Promise<{ article: ArticleRow; tags: string[]; seo: SeoFields }> {
  const article = await repo.selectArticleById(id);
  if (!article) throw new NotFoundError("Article not found");
  const [tags, seo] = await Promise.all([repo.selectArticleTagNames(id), repo.selectSeo("article", id)]);
  return { article, tags, seo: seo ?? EMPTY_SEO };
}

export async function getArticleFormOptions() {
  const [authors, categories] = await Promise.all([repo.selectAuthorOptions(), repo.selectCategoryOptions()]);
  return { authors, categories };
}

async function checkRefs(input: ArticleInput, current: ArticleRow | null) {
  if (input.authorId && input.authorId !== current?.authorId && !(await repo.selectAuthorById(input.authorId))) throw new ValidationError("Unknown author", { authorId: "Choose one of the listed authors." });
  if (input.categoryId && input.categoryId !== current?.categoryId) {
    const topic = await repo.selectCategoryById(input.categoryId);
    if (!topic) throw new ValidationError("Unknown topic", { categoryId: "Choose one of the listed topics." });
    if (!topic.isActive) throw new ValidationError("Topic hidden", { categoryId: "This topic is hidden. Show it again on the Topics screen or choose another." });
  }
}

const reserved = (slug: string) => {
  if (RESERVED_ARTICLE_SLUGS.includes(slug)) throw new ValidationError("Reserved slug", { slug: `“${slug}” is used by the topic and tag pages. Choose another slug.` });
};

export async function createArticle(input: ArticleInput, who: Who, now: Date = new Date()): Promise<{ id: string; slug: string }> {
  await checkRefs(input, null);
  const changeProblem = statusChangeProblem(null, input.status, who.canPublish);
  if (changeProblem) throw new ValidationError("Status", { status: changeProblem });
  const publishing = resolvePublishing({ status: input.status, requestedAt: input.publishAt, currentAt: null, content: input.content, now });
  failIf(publishing.problems, publishing.field ?? "status");

  const slug = await resolveCreateSlug({ name: input.title, explicit: input.slug, findTaken: repo.selectArticleSlugsLike });
  reserved(slug);
  const values: ArticleWrite = {
    slug, title: input.title, type: input.type, excerpt: input.excerpt, content: input.content, status: input.status, publishAt: publishing.publishAt,
    authorId: input.authorId, categoryId: input.categoryId, coverPublicId: input.coverPublicId, coverAlt: input.coverPublicId ? input.coverAlt ?? input.title : null,
  };
  const tagIds = await repo.ensureTags(input.tags.map((name) => ({ name, slug: slugify(name) })));
  // Writers without seo:write can not set search fields; the new article simply has none.
  const seo = who.canEditSeo ? seoOf(input) : null;

  const id = crypto.randomUUID();
  try {
    await repo.insertArticleGraph(id, values, tagIds, seo);
  } catch (error) {
    slugTaken(error);
  }
  await logAuditBestEffort({
    actor: who.actorId, action: "article.created", entityType: "article", entityId: id,
    metadata: { slug, title: input.title, type: input.type, status: input.status, publishAt: values.publishAt?.toISOString() ?? null, tags: tagIds.length },
  });
  touch();
  return { id, slug };
}

export async function updateArticle(id: string, input: ArticleInput, who: Who, now: Date = new Date()): Promise<void> {
  const { article: current, tags: currentTags, seo: currentSeo } = await getArticle(id);
  await checkRefs(input, current);
  const changeProblem = statusChangeProblem(current.status, input.status, who.canPublish);
  if (changeProblem) throw new ValidationError("Status", { status: changeProblem });
  const publishing = resolvePublishing({ status: input.status, requestedAt: input.publishAt, currentAt: current.publishAt, content: input.content, now });
  failIf(publishing.problems, publishing.field ?? "status");

  const slug = await resolveUpdateSlug({ current: current.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectArticleSlugsLike });
  reserved(slug);
  const next: ArticleWrite = {
    slug, title: input.title, type: input.type, excerpt: input.excerpt, content: input.content, status: input.status, publishAt: publishing.publishAt,
    authorId: input.authorId, categoryId: input.categoryId, coverPublicId: input.coverPublicId, coverAlt: input.coverPublicId ? input.coverAlt ?? input.title : null,
  };
  const tagIds = await repo.ensureTags(input.tags.map((name) => ({ name, slug: slugify(name) })));
  const nextSeo = who.canEditSeo ? seoOf(input) : null;

  const changed: string[] = [];
  if (next.slug !== current.slug) changed.push("slug");
  if (next.title !== current.title) changed.push("title");
  if (next.type !== current.type) changed.push("type");
  if (next.excerpt !== current.excerpt) changed.push("excerpt");
  if (JSON.stringify(next.content) !== JSON.stringify(current.content)) changed.push("content");
  if (next.status !== current.status) changed.push("status");
  if (when(next.publishAt) !== when(current.publishAt)) changed.push("publishAt");
  if (next.authorId !== current.authorId) changed.push("author");
  if (next.categoryId !== current.categoryId) changed.push("topic");
  if (next.coverPublicId !== current.coverPublicId) changed.push("cover");
  if (next.coverPublicId && next.coverAlt !== current.coverAlt) changed.push("coverAlt");
  if ([...input.tags].map((t) => t.toLowerCase()).sort().join("|") !== currentTags.map((t) => t.toLowerCase()).sort().join("|")) changed.push("tags");
  if (nextSeo && !sameSeo(nextSeo, currentSeo)) changed.push("seo");
  if (changed.length === 0) return;

  try {
    await repo.updateArticleGraph(id, next, tagIds, nextSeo);
  } catch (error) {
    slugTaken(error);
  }
  await logAuditBestEffort({
    actor: who.actorId, action: "article.updated", entityType: "article", entityId: id,
    metadata: { changed, ...(slug !== current.slug ? { slug: { from: current.slug, to: slug } } : {}), ...(next.status !== current.status ? { status: { from: current.status, to: next.status } } : {}) },
  });
  touch();
}

export async function deleteArticle(id: string, who: Who): Promise<void> {
  const current = await repo.selectArticleById(id);
  if (!current) throw new NotFoundError("Article not found");
  if (current.status === "PUBLISHED" || current.status === "SCHEDULED") throw new ConflictError("Archive this article before deleting it, so its address stops working on purpose.");
  if (!who.canPublish && current.status === "ARCHIVED") throw new ConflictError("Your account cannot delete an archived article.");
  await repo.deleteArticleRow(id);
  await logAuditBestEffort({ actor: who.actorId, action: "article.deleted", entityType: "article", entityId: id, metadata: { slug: current.slug, title: current.title, status: current.status } });
  touch();
}

/* ================================== pages ================================== */

export async function listPages(opts: { q?: string; status: ContentFilter; limit: number; offset: number }) {
  return page<PageListRow>(await repo.selectPages({ ...opts, limit: opts.limit + 1 }), opts.limit);
}

export async function getPage(id: string): Promise<{ page: PageRow; seo: SeoFields }> {
  const row = await repo.selectPageById(id);
  if (!row) throw new NotFoundError("Page not found");
  return { page: row, seo: (await repo.selectSeo("page", id)) ?? EMPTY_SEO };
}

export async function createPage(input: PageInput, who: Who, now: Date = new Date()): Promise<{ id: string; slug: string }> {
  const changeProblem = statusChangeProblem(null, input.status, who.canPublish);
  if (changeProblem) throw new ValidationError("Status", { status: changeProblem });
  const publishing = resolvePublishing({ status: input.status, requestedAt: input.publishAt, currentAt: null, content: input.content, now });
  failIf(publishing.problems, publishing.field ?? "status");
  const slug = await resolveCreateSlug({ name: input.title, explicit: input.slug, findTaken: repo.selectPageSlugsLike });
  const values: PageWrite = { slug, title: input.title, content: input.content, status: input.status, publishAt: publishing.publishAt };
  const id = crypto.randomUUID();
  try {
    await repo.insertPageGraph(id, values, who.canEditSeo ? seoOf(input) : null);
  } catch (error) {
    slugTaken(error);
  }
  await logAuditBestEffort({ actor: who.actorId, action: "page.created", entityType: "page", entityId: id, metadata: { slug, title: input.title, status: input.status } });
  touch();
  return { id, slug };
}

export async function updatePage(id: string, input: PageInput, who: Who, now: Date = new Date()): Promise<void> {
  const { page: current, seo: currentSeo } = await getPage(id);
  const changeProblem = statusChangeProblem(current.status, input.status, who.canPublish);
  if (changeProblem) throw new ValidationError("Status", { status: changeProblem });
  const publishing = resolvePublishing({ status: input.status, requestedAt: input.publishAt, currentAt: current.publishAt, content: input.content, now });
  failIf(publishing.problems, publishing.field ?? "status");
  const slug = await resolveUpdateSlug({ current: current.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectPageSlugsLike });
  const next: PageWrite = { slug, title: input.title, content: input.content, status: input.status, publishAt: publishing.publishAt };
  const nextSeo = who.canEditSeo ? seoOf(input) : null;

  const changed: string[] = [];
  if (next.slug !== current.slug) changed.push("slug");
  if (next.title !== current.title) changed.push("title");
  if (JSON.stringify(next.content) !== JSON.stringify(current.content)) changed.push("content");
  if (next.status !== current.status) changed.push("status");
  if (when(next.publishAt) !== when(current.publishAt)) changed.push("publishAt");
  if (nextSeo && !sameSeo(nextSeo, currentSeo)) changed.push("seo");
  if (changed.length === 0) return;

  try {
    await repo.updatePageGraph(id, next, nextSeo);
  } catch (error) {
    slugTaken(error);
  }
  await logAuditBestEffort({ actor: who.actorId, action: "page.updated", entityType: "page", entityId: id, metadata: { changed, ...(next.status !== current.status ? { status: { from: current.status, to: next.status } } : {}) } });
  touch();
}

export async function deletePage(id: string, who: Who): Promise<void> {
  const current = await repo.selectPageById(id);
  if (!current) throw new NotFoundError("Page not found");
  if (current.status === "PUBLISHED" || current.status === "SCHEDULED") throw new ConflictError("Archive this page before deleting it, so its address stops working on purpose.");
  await repo.deletePageRow(id);
  await logAuditBestEffort({ actor: who.actorId, action: "page.deleted", entityType: "page", entityId: id, metadata: { slug: current.slug, title: current.title } });
  touch();
}

/* ================================== authors, topics, tags ================================== */

export const listAuthors = () => repo.selectAuthors();
export const listCategories = () => repo.selectCategories();
export const listTags = () => repo.selectTags();

function duplicateName(error: unknown, field: string, what: string): never {
  if (uniqueViolationOf(error)) throw new ValidationError("Duplicate", { [field]: `Another ${what} already uses this name or address.` });
  throw error;
}

export async function createAuthor(input: AuthorInput, actorId: string): Promise<string> {
  const slug = await resolveCreateSlug({ name: input.displayName, explicit: input.slug, findTaken: repo.selectAuthorSlugsLike });
  let id: string;
  try {
    id = await repo.insertAuthor({ slug, displayName: input.displayName, bio: input.bio });
  } catch (error) {
    duplicateName(error, "slug", "author");
  }
  await logAuditBestEffort({ actor: actorId, action: "author.created", entityType: "author", entityId: id, metadata: { slug, name: input.displayName } });
  touch();
  return id;
}

export async function updateAuthor(id: string, input: AuthorInput, actorId: string): Promise<void> {
  const current = await repo.selectAuthorById(id);
  if (!current) throw new NotFoundError("Author not found");
  await repo.updateAuthor(id, { displayName: input.displayName, bio: input.bio });
  await logAuditBestEffort({ actor: actorId, action: "author.updated", entityType: "author", entityId: id, metadata: { slug: current.slug } });
  touch();
}

export async function deleteAuthor(id: string, actorId: string): Promise<void> {
  const current = await repo.selectAuthorById(id);
  if (!current) throw new NotFoundError("Author not found");
  await repo.deleteAuthorRow(id);
  await logAuditBestEffort({ actor: actorId, action: "author.deleted", entityType: "author", entityId: id, metadata: { slug: current.slug, articlesKept: current.articleCount } });
  touch();
}

export async function createCategory(input: CategoryInput, actorId: string): Promise<string> {
  const slug = await resolveCreateSlug({ name: input.name, explicit: input.slug, findTaken: repo.selectCategorySlugsLike });
  let id: string;
  try {
    id = await repo.insertCategory({ slug, name: input.name, description: input.description, sortOrder: input.sortOrder, isActive: input.isActive });
  } catch (error) {
    duplicateName(error, "name", "topic");
  }
  await logAuditBestEffort({ actor: actorId, action: "article_topic.created", entityType: "article_topic", entityId: id, metadata: { slug, name: input.name } });
  touch();
  return id;
}

/** The slug of a topic never changes after it is created: it is part of public addresses. */
export async function updateCategory(id: string, input: CategoryInput, actorId: string): Promise<void> {
  const current = await repo.selectCategoryById(id);
  if (!current) throw new NotFoundError("Topic not found");
  try {
    await repo.updateCategory(id, { name: input.name, description: input.description, sortOrder: input.sortOrder, isActive: input.isActive });
  } catch (error) {
    duplicateName(error, "name", "topic");
  }
  await logAuditBestEffort({ actor: actorId, action: "article_topic.updated", entityType: "article_topic", entityId: id, metadata: { slug: current.slug, isActive: input.isActive } });
  touch();
}

export async function deleteCategory(id: string, actorId: string): Promise<void> {
  const current = await repo.selectCategoryById(id);
  if (!current) throw new NotFoundError("Topic not found");
  await repo.deleteCategoryRow(id);
  await logAuditBestEffort({ actor: actorId, action: "article_topic.deleted", entityType: "article_topic", entityId: id, metadata: { slug: current.slug, articlesKept: current.articleCount } });
  touch();
}

export async function createTag(input: TagInput, actorId: string): Promise<string> {
  const slug = await resolveCreateSlug({ name: input.name, explicit: input.slug, findTaken: repo.selectTagSlugsLike });
  let id: string;
  try {
    id = await repo.insertTag({ slug, name: input.name });
  } catch (error) {
    duplicateName(error, "name", "tag");
  }
  await logAuditBestEffort({ actor: actorId, action: "article_tag.created", entityType: "article_tag", entityId: id, metadata: { slug, name: input.name } });
  touch();
  return id;
}

export async function renameTag(id: string, input: TagInput, actorId: string): Promise<void> {
  const current = await repo.selectTagById(id);
  if (!current) throw new NotFoundError("Tag not found");
  try {
    await repo.renameTag(id, input.name);
  } catch (error) {
    duplicateName(error, "name", "tag");
  }
  await logAuditBestEffort({ actor: actorId, action: "article_tag.renamed", entityType: "article_tag", entityId: id, metadata: { slug: current.slug } });
  touch();
}

export async function deleteTag(id: string, actorId: string): Promise<void> {
  const current = await repo.selectTagById(id);
  if (!current) throw new NotFoundError("Tag not found");
  await repo.deleteTagRow(id);
  await logAuditBestEffort({ actor: actorId, action: "article_tag.deleted", entityType: "article_tag", entityId: id, metadata: { slug: current.slug, articlesAffected: current.articleCount } });
  touch();
}

export type { ArticleListRow };
