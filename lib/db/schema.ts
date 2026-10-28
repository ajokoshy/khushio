import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(), slug: text("slug").notNull().unique(), name: text("name").notNull(),
  brand: text("brand").notNull().default(""), category: text("category").notNull(), blurb: text("blurb").notNull().default(""),
  price: integer("price").notNull(), mrp: integer("mrp"), status: text("status").notNull().default("published"), imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("products_category_idx").on(t.category), index("products_status_idx").on(t.status)]);
export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  merchant: text("merchant").notNull(), url: text("url").notNull(),
});
export const clicks = pgTable("clicks", { id: uuid("id").primaryKey().defaultRandom(), offerId: uuid("offer_id").notNull(), at: timestamp("at").defaultNow(), referrer: text("referrer") });
export const deals = pgTable("deals", { id: uuid("id").primaryKey().defaultRandom(), title: text("title").notNull(), merchant: text("merchant").notNull(), url: text("url").notNull(), ends: text("ends").notNull().default(""), createdAt: timestamp("created_at").defaultNow() });
export const coupons = pgTable("coupons", { id: uuid("id").primaryKey().defaultRandom(), code: text("code").notNull(), merchant: text("merchant").notNull(), detail: text("detail").notNull().default(""), url: text("url").notNull(), createdAt: timestamp("created_at").defaultNow() });
export const articles = pgTable("articles", { id: uuid("id").primaryKey().defaultRandom(), slug: text("slug").notNull().unique(), title: text("title").notNull(), excerpt: text("excerpt").notNull().default(""), body: text("body").notNull(), date: text("date").notNull(), createdAt: timestamp("created_at").defaultNow() });
export const siteSettings = pgTable("site_settings", { key: text("key").primaryKey(), value: text("value").notNull().default(""), updatedAt: timestamp("updated_at").defaultNow() });
export const loginAttempts = pgTable("login_attempts", { id: uuid("id").primaryKey().defaultRandom(), ip: text("ip").notNull(), at: timestamp("at").defaultNow() });
