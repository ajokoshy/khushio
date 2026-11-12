import { sql } from "drizzle-orm";
import { pgTable, pgEnum, text, uuid, integer, boolean, index, uniqueIndex, primaryKey, timestamp, char } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./_shared";

export const productStatus = pgEnum("product_status", [
  "DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED", "DISCONTINUED",
]);

export const brands = pgTable("brands", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  isFeatured: boolean("is_featured").notNull().default(false),
  /** Release 3A: archived brands are hidden but keep their products. Never delete a brand that products use. */
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const categories = pgTable("categories", {
  id: id(),
  parentId: uuid("parent_id"),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("categories_parent_idx").on(t.parentId),
  /** Release 3A: one category name per parent, ignoring case. Top-level categories share one "no parent" bucket. */
  uniqueIndex("categories_parent_name_uq").on(
    sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    sql`lower(${t.name})`,
  ),
]);

export const products = pgTable("products", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary"),
  description: text("description"),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  status: productStatus("status").notNull().default("DRAFT"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("products_status_idx").on(t.status, t.publishAt),
  index("products_brand_idx").on(t.brandId),
]);

export const productVariants = pgTable("product_variants", {
  id: id(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku"),
  label: text("label").notNull(),
  priceMinor: integer("price_minor"),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  createdAt: createdAt(),
}, (t) => [index("variants_product_idx").on(t.productId)]);

export const productImages = pgTable("product_images", {
  id: id(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull(),
  alt: text("alt").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("images_product_idx").on(t.productId)]);

export const productCategories = pgTable("product_categories", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (t) => [primaryKey({ columns: [t.productId, t.categoryId] }), index("pc_category_idx").on(t.categoryId)]);

export const productAttributes = pgTable("product_attributes", {
  id: id(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  value: text("value").notNull(),
}, (t) => [index("attrs_product_idx").on(t.productId)]);

export const productTags = pgTable("product_tags", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
}, (t) => [primaryKey({ columns: [t.productId, t.tag] })]);

export const productCollections = pgTable("product_collections", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const collectionProducts = pgTable("collection_products", {
  collectionId: uuid("collection_id").notNull().references(() => productCollections.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.collectionId, t.productId] })]);
