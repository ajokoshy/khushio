import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, boolean, jsonb, timestamp, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./_shared";

/**
 * Release 6A: articles, pages and their editorial tables.
 *
 * Content is stored as JSON (the editor document), never as HTML. The server renders it through a whitelist
 * (src/modules/content/document.ts), so pasted HTML or script can not run (stored XSS).
 *
 * Statuses are the same words products use: DRAFT, REVIEW, SCHEDULED, PUBLISHED, ARCHIVED (src/modules/content/types.ts).
 * An article is visible to visitors while  status = 'PUBLISHED'  OR  (status = 'SCHEDULED' AND publish_at <= now())
 * (src/modules/content/visibility.ts). Nothing has to run when a scheduled article goes live.
 */

export const authorProfiles = pgTable("author_profiles", {
  id: id(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contentCategories = pgTable("content_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  /** One name per topic, ignoring case. */
  uniqueIndex("content_categories_name_uq").on(sql`lower(${t.name})`),
]);

export const contentTags = pgTable("content_tags", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("content_tags_name_uq").on(sql`lower(${t.name})`),
]);

export const articles = pgTable("articles", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  /** Release 6B: article | guide | review | comparison | how-to (src/modules/content/types.ts). One table, one editor, one set of statuses. */
  type: text("type").notNull().default("article"),
  excerpt: text("excerpt"),
  /** The Tiptap/ProseMirror document. Always passed through sanitizeDocument() before it is stored. */
  content: jsonb("content").notNull().default(sql`'{"type":"doc","content":[]}'::jsonb`),
  /** DRAFT | REVIEW | SCHEDULED | PUBLISHED | ARCHIVED */
  status: text("status").notNull().default("DRAFT"),
  /** The go-live time of a SCHEDULED article; the first publish time of a PUBLISHED one. */
  publishAt: timestamp("publish_at", { withTimezone: true }),
  authorId: uuid("author_id").references(() => authorProfiles.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").references(() => contentCategories.id, { onDelete: "set null" }),
  /** Cloudinary public id of a media-library image. */
  coverPublicId: text("cover_public_id"),
  coverAlt: text("cover_alt"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("articles_status_publish_idx").on(t.status, t.publishAt),
  /** Release 6B: the /guides pages. */
  index("articles_type_status_publish_idx").on(t.type, t.status, t.publishAt),
  index("articles_category_idx").on(t.categoryId),
  index("articles_author_idx").on(t.authorId),
]);

export const articleTags = pgTable("article_tags", {
  articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => contentTags.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.articleId, t.tagId] }),
  index("article_tags_tag_idx").on(t.tagId),
]);

/** Stand-alone pages (about, how we earn money, ...), served at /p/<slug>. Same editor and statuses as articles. */
export const pages = pgTable("pages", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  content: jsonb("content").notNull().default(sql`'{"type":"doc","content":[]}'::jsonb`),
  status: text("status").notNull().default("DRAFT"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("pages_status_publish_idx").on(t.status, t.publishAt),
]);

/** Search-engine fields for any content item. Polymorphic: entity_type is 'article' or 'page' (Release 7A adds more). One row per item. */
export const seoMetadata = pgTable("seo_metadata", {
  id: id(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  title: text("title"),
  description: text("description"),
  canonical: text("canonical"),
  ogImage: text("og_image"),
  /** Null = the default (index, follow). Otherwise noindex,follow or noindex,nofollow. */
  robots: text("robots"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("seo_entity_uq").on(t.entityType, t.entityId),
]);
