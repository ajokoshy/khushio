import { sql } from "drizzle-orm";
import { pgTable, text, boolean, jsonb, integer, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./_shared";

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: updatedAt(),
});

export const navigationItems = pgTable("navigation_items", {
  id: id(),
  area: text("area").notNull(),
  label: text("label").notNull(),
  href: text("href").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/** `type` must match a component registered in code; no HTML or JS is stored. */
export const homepageSections = pgTable("homepage_sections", {
  id: id(),
  type: text("type").notNull(),
  heading: text("heading"),
  config: jsonb("config").notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("home_sections_order_idx").on(t.sortOrder)]);

export const mediaAssets = pgTable("media_assets", {
  id: id(),
  publicId: text("public_id").notNull().unique(),
  contentHash: text("content_hash"),
  width: integer("width"),
  height: integer("height"),
  bytes: integer("bytes"),
  alt: text("alt"),
  createdAt: createdAt(),
}, (t) => [
  index("media_hash_idx").on(t.contentHash),
  /** Release 3B: the same picture is stored once. content_hash is Cloudinary's etag of the file. */
  uniqueIndex("media_hash_uq").on(t.contentHash).where(sql`${t.contentHash} is not null`),
]);

/**
 * Release 7A: permanent redirects and "gone" pages, looked up by the middleware from a small cached map
 * (src/modules/redirects). One row per old address.
 *   from_path     the old address, always a path starting with "/", lower case, no query, no trailing slash (src/modules/redirects/path.ts)
 *   to_path       where it goes (a path on this site); NULL for a 410 "gone" row
 *   status_code   301 (moved for good), 302 (moved for now) or 410 (removed on purpose)
 *   source        'auto' = made by a slug change or a delete, 'manual' = typed on /admin/redirects
 */
export const redirects = pgTable("redirects", {
  id: id(),
  fromPath: text("from_path").notNull(),
  toPath: text("to_path"),
  statusCode: integer("status_code").notNull().default(301),
  source: text("source").notNull().default("manual"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("redirects_from_path_uq").on(t.fromPath),
  index("redirects_to_path_idx").on(t.toPath),
  check("redirects_status_chk", sql`${t.statusCode} in (301, 302, 410)`),
  check("redirects_target_chk", sql`(${t.statusCode} = 410 and ${t.toPath} is null) or (${t.statusCode} <> 410 and ${t.toPath} is not null and ${t.toPath} <> ${t.fromPath})`),
]);
