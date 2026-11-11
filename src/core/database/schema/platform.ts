import { pgTable, text, boolean, jsonb, integer, timestamp, index } from "drizzle-orm/pg-core";
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
}, (t) => [index("media_hash_idx").on(t.contentHash)]);
