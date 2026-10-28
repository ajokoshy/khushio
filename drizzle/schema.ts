// Phase 2 schema (Neon Postgres). Install: npm i drizzle-orm @neondatabase/serverless && npm i -D drizzle-kit
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
export const merchants = pgTable("merchants", { id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), slug: text("slug").notNull().unique() });
export const brands = pgTable("brands", { id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), slug: text("slug").notNull().unique(), about: text("about") });
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(), slug: text("slug").notNull().unique(), name: text("name").notNull(),
  brandId: uuid("brand_id").references(() => brands.id), categorySlug: text("category_slug").notNull(), blurb: text("blurb"),
  pricePaise: integer("price_paise"), imageAssetId: text("image_asset_id"), status: text("status").notNull().default("draft"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [index("products_category_idx").on(t.categorySlug), index("products_status_idx").on(t.status)]);
export const offers = pgTable("offers", { id: uuid("id").primaryKey().defaultRandom(), productId: uuid("product_id").references(() => products.id).notNull(), merchantId: uuid("merchant_id").references(() => merchants.id).notNull(), url: text("url").notNull() });
export const clicks = pgTable("clicks", { id: uuid("id").primaryKey().defaultRandom(), offerId: uuid("offer_id").references(() => offers.id).notNull(), at: timestamp("at").defaultNow(), referrer: text("referrer") });
