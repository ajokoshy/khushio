import { and, asc, desc, eq, ilike, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { goneStatements, movedStatements } from "@/core/database/redirect-statements";
import { articles, articleTags, authorProfiles, contentCategories, contentTags, pages, seoMetadata } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import { sanitizeDocument } from "./document";
import type {
  ArticleListRow, ArticleRow, ArticleType, ArticleWrite, AuthorRow, CategoryRow, ContentFilter, ContentStatus, PageListRow, PageRow, PageWrite,
  PublicArticle, PublicArticleSummary, PublicPage, SeoFields, TagRow, TypeFilter,
} from "./types";
import { ARTICLE_TYPES, hasAnySeo } from "./types";
import { visibleArticleCondition, visiblePageCondition } from "./visibility";

/** Repository: the only code in this module that talks to the database. */

const status = (v: string) => v as ContentStatus;
const kind = (v: string) => v as ArticleType;
const slugsLike = (column: typeof articles.slug | typeof pages.slug | typeof authorProfiles.slug | typeof contentCategories.slug | typeof contentTags.slug, base: string) =>
  or(eq(column, base), like(column, `${escapeLike(base)}-%`));

/* ================================== SEO (articles and pages) ================================== */

export type SeoEntity = "article" | "page";

export async function selectSeo(entityType: SeoEntity, entityId: string): Promise<SeoFields | null> {
  const [row] = await db()
    .select({ title: seoMetadata.title, description: seoMetadata.description, canonical: seoMetadata.canonical, ogImage: seoMetadata.ogImage, robots: seoMetadata.robots })
    .from(seoMetadata)
    .where(and(eq(seoMetadata.entityType, entityType), eq(seoMetadata.entityId, entityId)))
    .limit(1);
  return row ? { ...row, robots: row.robots as SeoFields["robots"] } : null;
}

/** The statement that saves (or, when every field is empty, removes) the SEO row. Un-awaited, for runAtomically. */
function seoStatement(d: ReturnType<typeof db>, entityType: SeoEntity, entityId: string, seo: SeoFields) {
  if (!hasAnySeo(seo)) return d.delete(seoMetadata).where(and(eq(seoMetadata.entityType, entityType), eq(seoMetadata.entityId, entityId)));
  return d
    .insert(seoMetadata)
    .values({ entityType, entityId, ...seo })
    .onConflictDoUpdate({ target: [seoMetadata.entityType, seoMetadata.entityId], set: { ...seo, updatedAt: new Date() } });
}

/* ================================== admin: articles ================================== */

const articleListColumns = {
  id: articles.id,
  slug: articles.slug,
  title: articles.title,
  type: articles.type,
  status: articles.status,
  publishAt: articles.publishAt,
  updatedAt: articles.updatedAt,
  authorName: authorProfiles.displayName,
  categoryName: contentCategories.name,
};

function articleListQuery() {
  return db()
    .select(articleListColumns)
    .from(articles)
    .leftJoin(authorProfiles, eq(authorProfiles.id, articles.authorId))
    .leftJoin(contentCategories, eq(contentCategories.id, articles.categoryId));
}

export async function selectArticles(opts: { q?: string; status: ContentFilter; type?: TypeFilter; limit: number; offset: number }): Promise<ArticleListRow[]> {
  const conditions: (SQL | undefined)[] = [];
  if (opts.status !== "all") conditions.push(eq(articles.status, opts.status));
  if (opts.type && opts.type !== "all") conditions.push(eq(articles.type, opts.type));
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(articles.title, pattern), ilike(articles.slug, pattern)));
  }
  const rows = await articleListQuery().where(and(...conditions)).orderBy(desc(articles.updatedAt), asc(articles.id)).limit(opts.limit).offset(opts.offset);
  return rows.map((r) => ({ ...r, type: kind(r.type), status: status(r.status) }));
}

export async function selectArticleById(id: string): Promise<ArticleRow | null> {
  const [row] = await db()
    .select({ ...articleListColumns, excerpt: articles.excerpt, content: articles.content, authorId: articles.authorId, categoryId: articles.categoryId, coverPublicId: articles.coverPublicId, coverAlt: articles.coverAlt })
    .from(articles)
    .leftJoin(authorProfiles, eq(authorProfiles.id, articles.authorId))
    .leftJoin(contentCategories, eq(contentCategories.id, articles.categoryId))
    .where(eq(articles.id, id))
    .limit(1);
  return row ? { ...row, type: kind(row.type), status: status(row.status), content: sanitizeDocument(row.content) } : null;
}

export async function selectArticleTagNames(articleId: string): Promise<string[]> {
  const rows = await db().select({ name: contentTags.name }).from(articleTags).innerJoin(contentTags, eq(contentTags.id, articleTags.tagId)).where(eq(articleTags.articleId, articleId)).orderBy(asc(contentTags.name));
  return rows.map((r) => r.name);
}

export async function selectArticleSlugsLike(base: string): Promise<string[]> {
  const rows = await db().select({ slug: articles.slug }).from(articles).where(slugsLike(articles.slug, base));
  return rows.map((r) => r.slug);
}

export async function insertArticleGraph(id: string, values: ArticleWrite, tagIds: readonly string[], seo: SeoFields | null): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [d.insert(articles).values({ id, ...values })];
    if (tagIds.length > 0) statements.push(d.insert(articleTags).values(tagIds.map((tagId) => ({ articleId: id, tagId }))));
    if (seo && hasAnySeo(seo)) statements.push(seoStatement(d, "article", id, seo));
    return statements;
  });
}

/** `seo` null leaves the SEO row alone (a writer without seo:write); an all-empty object removes it. */
export async function updateArticleGraph(id: string, values: ArticleWrite, tagIds: readonly string[], seo: SeoFields | null, moved: { fromPath: string; toPath: string } | null = null): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [d.update(articles).set(values).where(eq(articles.id, id)), d.delete(articleTags).where(eq(articleTags.articleId, id))];
    if (tagIds.length > 0) statements.push(d.insert(articleTags).values(tagIds.map((tagId) => ({ articleId: id, tagId }))));
    if (seo) statements.push(seoStatement(d, "article", id, seo));
    // Release 7A: a changed slug and its 301 are one all-or-nothing write.
    if (moved) statements.push(...movedStatements(d, moved));
    return statements;
  });
}

export async function deleteArticleRow(id: string, gonePath: string | null = null): Promise<void> {
  await runAtomically((d) => [d.delete(seoMetadata).where(and(eq(seoMetadata.entityType, "article"), eq(seoMetadata.entityId, id))), d.delete(articles).where(eq(articles.id, id)), ...(gonePath ? goneStatements(d, { path: gonePath }) : [])]);
}

/** Finds or creates the tags with these names (matched by web address or by name, ignoring case) and returns their ids in order. */
export async function ensureTags(wanted: readonly { name: string; slug: string }[]): Promise<string[]> {
  if (wanted.length === 0) return [];
  await db().insert(contentTags).values(wanted.map((w) => ({ name: w.name, slug: w.slug }))).onConflictDoNothing();
  const rows = await db()
    .select({ id: contentTags.id, slug: contentTags.slug, name: contentTags.name })
    .from(contentTags)
    .where(or(inArray(contentTags.slug, wanted.map((w) => w.slug)), inArray(sql`lower(${contentTags.name})`, wanted.map((w) => w.name.toLowerCase()))));
  const out: string[] = [];
  for (const w of wanted) {
    const hit = rows.find((r) => r.slug === w.slug) ?? rows.find((r) => r.name.toLowerCase() === w.name.toLowerCase());
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

/* ================================== admin: pages ================================== */

const pageListColumns = { id: pages.id, slug: pages.slug, title: pages.title, status: pages.status, publishAt: pages.publishAt, updatedAt: pages.updatedAt };

export async function selectPages(opts: { q?: string; status: ContentFilter; limit: number; offset: number }): Promise<PageListRow[]> {
  const conditions: (SQL | undefined)[] = [];
  if (opts.status !== "all") conditions.push(eq(pages.status, opts.status));
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(pages.title, pattern), ilike(pages.slug, pattern)));
  }
  const rows = await db().select(pageListColumns).from(pages).where(and(...conditions)).orderBy(desc(pages.updatedAt), asc(pages.id)).limit(opts.limit).offset(opts.offset);
  return rows.map((r) => ({ ...r, status: status(r.status) }));
}

export async function selectPageById(id: string): Promise<PageRow | null> {
  const [row] = await db().select({ ...pageListColumns, content: pages.content }).from(pages).where(eq(pages.id, id)).limit(1);
  return row ? { ...row, status: status(row.status), content: sanitizeDocument(row.content) } : null;
}

export async function selectPageSlugsLike(base: string): Promise<string[]> {
  const rows = await db().select({ slug: pages.slug }).from(pages).where(slugsLike(pages.slug, base));
  return rows.map((r) => r.slug);
}

export async function insertPageGraph(id: string, values: PageWrite, seo: SeoFields | null): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [d.insert(pages).values({ id, ...values })];
    if (seo && hasAnySeo(seo)) statements.push(seoStatement(d, "page", id, seo));
    return statements;
  });
}

export async function updatePageGraph(id: string, values: PageWrite, seo: SeoFields | null, moved: { fromPath: string; toPath: string } | null = null): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [d.update(pages).set(values).where(eq(pages.id, id))];
    if (seo) statements.push(seoStatement(d, "page", id, seo));
    if (moved) statements.push(...movedStatements(d, moved));
    return statements;
  });
}

export async function deletePageRow(id: string, gonePath: string | null = null): Promise<void> {
  await runAtomically((d) => [d.delete(seoMetadata).where(and(eq(seoMetadata.entityType, "page"), eq(seoMetadata.entityId, id))), d.delete(pages).where(eq(pages.id, id)), ...(gonePath ? goneStatements(d, { path: gonePath }) : [])]);
}

/* ================================== admin: authors, topics, tags ================================== */

const authorColumns = { id: authorProfiles.id, slug: authorProfiles.slug, displayName: authorProfiles.displayName, bio: authorProfiles.bio, articleCount: sql<number>`(select count(*)::int from articles a where a.author_id = ${authorProfiles.id})` };

export const selectAuthors = (): Promise<AuthorRow[]> => db().select(authorColumns).from(authorProfiles).orderBy(asc(authorProfiles.displayName), asc(authorProfiles.id));
export async function selectAuthorById(id: string): Promise<AuthorRow | null> {
  const [row] = await db().select(authorColumns).from(authorProfiles).where(eq(authorProfiles.id, id)).limit(1);
  return row ?? null;
}
export async function selectAuthorSlugsLike(base: string): Promise<string[]> {
  return (await db().select({ slug: authorProfiles.slug }).from(authorProfiles).where(slugsLike(authorProfiles.slug, base))).map((r) => r.slug);
}
export async function insertAuthor(values: { slug: string; displayName: string; bio: string | null }): Promise<string> {
  const [row] = await db().insert(authorProfiles).values(values).returning({ id: authorProfiles.id });
  return (row as { id: string }).id;
}
export async function updateAuthor(id: string, values: { displayName: string; bio: string | null }): Promise<void> {
  await db().update(authorProfiles).set(values).where(eq(authorProfiles.id, id));
}
export async function deleteAuthorRow(id: string): Promise<void> {
  await db().delete(authorProfiles).where(eq(authorProfiles.id, id));
}

const categoryColumns = {
  id: contentCategories.id, slug: contentCategories.slug, name: contentCategories.name, description: contentCategories.description, sortOrder: contentCategories.sortOrder, isActive: contentCategories.isActive,
  articleCount: sql<number>`(select count(*)::int from articles a where a.category_id = ${contentCategories.id})`,
};
export const selectCategories = (): Promise<CategoryRow[]> => db().select(categoryColumns).from(contentCategories).orderBy(asc(contentCategories.sortOrder), asc(contentCategories.name), asc(contentCategories.id));
export async function selectCategoryById(id: string): Promise<CategoryRow | null> {
  const [row] = await db().select(categoryColumns).from(contentCategories).where(eq(contentCategories.id, id)).limit(1);
  return row ?? null;
}
export async function selectCategorySlugsLike(base: string): Promise<string[]> {
  return (await db().select({ slug: contentCategories.slug }).from(contentCategories).where(slugsLike(contentCategories.slug, base))).map((r) => r.slug);
}
export async function insertCategory(values: { slug: string; name: string; description: string | null; sortOrder: number; isActive: boolean }): Promise<string> {
  const [row] = await db().insert(contentCategories).values(values).returning({ id: contentCategories.id });
  return (row as { id: string }).id;
}
export async function updateCategory(id: string, values: { name: string; description: string | null; sortOrder: number; isActive: boolean }): Promise<void> {
  await db().update(contentCategories).set(values).where(eq(contentCategories.id, id));
}
export async function deleteCategoryRow(id: string): Promise<void> {
  await db().delete(contentCategories).where(eq(contentCategories.id, id));
}

const tagColumns = { id: contentTags.id, slug: contentTags.slug, name: contentTags.name, articleCount: sql<number>`(select count(*)::int from article_tags t where t.tag_id = ${contentTags.id})` };
export const selectTags = (): Promise<TagRow[]> => db().select(tagColumns).from(contentTags).orderBy(asc(contentTags.name), asc(contentTags.id));
export async function selectTagById(id: string): Promise<TagRow | null> {
  const [row] = await db().select(tagColumns).from(contentTags).where(eq(contentTags.id, id)).limit(1);
  return row ?? null;
}
export async function selectTagSlugsLike(base: string): Promise<string[]> {
  return (await db().select({ slug: contentTags.slug }).from(contentTags).where(slugsLike(contentTags.slug, base))).map((r) => r.slug);
}
export async function insertTag(values: { slug: string; name: string }): Promise<string> {
  const [row] = await db().insert(contentTags).values(values).returning({ id: contentTags.id });
  return (row as { id: string }).id;
}
export async function renameTag(id: string, name: string): Promise<void> {
  await db().update(contentTags).set({ name }).where(eq(contentTags.id, id));
}
export async function deleteTagRow(id: string): Promise<void> {
  await db().delete(contentTags).where(eq(contentTags.id, id));
}

/** Options for the article form's author and topic selects. */
export const selectAuthorOptions = () => db().select({ id: authorProfiles.id, name: authorProfiles.displayName }).from(authorProfiles).orderBy(asc(authorProfiles.displayName));
export const selectCategoryOptions = () => db().select({ id: contentCategories.id, name: contentCategories.name, isActive: contentCategories.isActive }).from(contentCategories).orderBy(asc(contentCategories.sortOrder), asc(contentCategories.name));

/* ================================== public ================================== */

const summaryColumns = {
  slug: articles.slug,
  title: articles.title,
  type: articles.type,
  excerpt: articles.excerpt,
  publishAt: articles.publishAt,
  coverPublicId: articles.coverPublicId,
  coverAlt: articles.coverAlt,
  authorName: authorProfiles.displayName,
  categoryName: contentCategories.name,
  /** A hidden topic still labels its articles, but has no page to link to. */
  categorySlug: sql<string | null>`case when ${contentCategories.isActive} then ${contentCategories.slug} end`,
};

/** Newest first, only what visitors may see (database clock). Reads limit+1 so the caller knows whether a next page exists. */
export async function selectVisibleArticles(opts: { categoryId?: string; tagId?: string; types?: readonly ArticleType[]; limit: number; offset: number }): Promise<PublicArticleSummary[]> {
  const conditions: (SQL | undefined)[] = [visibleArticleCondition()];
  if (opts.categoryId) conditions.push(eq(articles.categoryId, opts.categoryId));
  if (opts.types && opts.types.length > 0) conditions.push(inArray(articles.type, [...opts.types]));
  if (opts.tagId) conditions.push(sql`exists (select 1 from article_tags at where at.article_id = ${articles.id} and at.tag_id = ${opts.tagId})`);
  const rows = await db()
    .select(summaryColumns)
    .from(articles)
    .leftJoin(authorProfiles, eq(authorProfiles.id, articles.authorId))
    .leftJoin(contentCategories, eq(contentCategories.id, articles.categoryId))
    .where(and(...conditions))
    .orderBy(desc(articles.publishAt), asc(articles.id))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows.map((r) => ({ ...r, type: kind(r.type) }));
}

/** The guide types (everything but the plain article) that have at least one visible item, in the order of ARTICLE_TYPES. Uses articles_type_status_publish_idx. */
export async function selectVisibleGuideTypes(): Promise<ArticleType[]> {
  const rows = await db().selectDistinct({ type: articles.type }).from(articles).where(and(visibleArticleCondition(), sql`${articles.type} <> 'article'`));
  const present = new Set(rows.map((r) => r.type));
  return ARTICLE_TYPES.filter((t) => t !== "article" && present.has(t));
}

/**
 * One article by slug, with tags and SEO. PUBLISHED and SCHEDULED rows are returned WITHOUT the time test: the caller
 * applies isContentVisible() with the clock at call time, so a cached copy can not show an article early.
 */
export async function selectArticleForReader(slug: string): Promise<PublicArticle | null> {
  const [row] = await db()
    .select({ ...summaryColumns, id: articles.id, status: articles.status, content: articles.content, updatedAt: articles.updatedAt })
    .from(articles)
    .leftJoin(authorProfiles, eq(authorProfiles.id, articles.authorId))
    .leftJoin(contentCategories, eq(contentCategories.id, articles.categoryId))
    .where(and(eq(articles.slug, slug), inArray(articles.status, ["PUBLISHED", "SCHEDULED"])))
    .limit(1);
  if (!row) return null;
  const [tags, seo] = await Promise.all([
    db().select({ slug: contentTags.slug, name: contentTags.name }).from(articleTags).innerJoin(contentTags, eq(contentTags.id, articleTags.tagId)).where(eq(articleTags.articleId, row.id)).orderBy(asc(contentTags.name)),
    selectSeo("article", row.id),
  ]);
  return { ...row, type: kind(row.type), status: status(row.status), content: sanitizeDocument(row.content), tags, seo: seo ?? { title: null, description: null, canonical: null, ogImage: null, robots: null } };
}

export async function selectPageForReader(slug: string): Promise<PublicPage | null> {
  const [row] = await db()
    .select({ id: pages.id, slug: pages.slug, title: pages.title, status: pages.status, publishAt: pages.publishAt, content: pages.content, updatedAt: pages.updatedAt })
    .from(pages)
    .where(and(eq(pages.slug, slug), inArray(pages.status, ["PUBLISHED", "SCHEDULED"])))
    .limit(1);
  if (!row) return null;
  const seo = await selectSeo("page", row.id);
  return { ...row, status: status(row.status), content: sanitizeDocument(row.content), seo: seo ?? { title: null, description: null, canonical: null, ogImage: null, robots: null } };
}

/** Topics that have at least one visible article, for the filter row on /articles. */
export async function selectPublicTopics(): Promise<{ slug: string; name: string }[]> {
  return db()
    .select({ slug: contentCategories.slug, name: contentCategories.name })
    .from(contentCategories)
    .where(and(eq(contentCategories.isActive, true), sql`exists (select 1 from ${articles} where ${articles.categoryId} = ${contentCategories.id} and ${visibleArticleCondition()})`))
    .orderBy(asc(contentCategories.sortOrder), asc(contentCategories.name));
}

export async function selectActiveCategoryBySlug(slug: string): Promise<{ id: string; slug: string; name: string; description: string | null } | null> {
  const [row] = await db().select({ id: contentCategories.id, slug: contentCategories.slug, name: contentCategories.name, description: contentCategories.description }).from(contentCategories).where(and(eq(contentCategories.slug, slug), eq(contentCategories.isActive, true))).limit(1);
  return row ?? null;
}

export async function selectTagBySlug(slug: string): Promise<{ id: string; slug: string; name: string } | null> {
  const [row] = await db().select({ id: contentTags.id, slug: contentTags.slug, name: contentTags.name }).from(contentTags).where(eq(contentTags.slug, slug)).limit(1);
  return row ?? null;
}

/** Items the editor kept out of search results do not belong in the sitemap either. */
const notNoindex = (type: SeoEntity, id: typeof articles.id | typeof pages.id) => sql`not exists (select 1 from ${seoMetadata} where ${seoMetadata.entityType} = ${type} and ${seoMetadata.entityId} = ${id} and ${seoMetadata.robots} is not null)`;

export async function selectSitemapContent(limit: number): Promise<{ articles: { slug: string; updatedAt: Date }[]; pages: { slug: string; updatedAt: Date }[]; topics: { slug: string }[]; guideTypes: ArticleType[] }> {
  const [a, p, t, g] = await Promise.all([
    db().select({ slug: articles.slug, updatedAt: articles.updatedAt }).from(articles).where(and(visibleArticleCondition(), notNoindex("article", articles.id))).orderBy(desc(articles.publishAt)).limit(limit),
    db().select({ slug: pages.slug, updatedAt: pages.updatedAt }).from(pages).where(and(visiblePageCondition(), notNoindex("page", pages.id))).limit(limit),
    selectPublicTopics(),
    selectVisibleGuideTypes(),
  ]);
  return { articles: a, pages: p, topics: t.map((x) => ({ slug: x.slug })), guideTypes: g };
}
