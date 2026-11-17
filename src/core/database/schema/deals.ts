import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, boolean, index, uniqueIndex, primaryKey, timestamp, char } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./_shared";
import { categories, products } from "./catalog";
import { affiliateLinks, merchants } from "./merchants-affiliate";

/**
 * Release 5A: deals and coupons.
 *
 * An offer is visible to visitors only while   status = 'published' AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
 * (see src/modules/deals/window.ts). Nothing flips a flag when a deal ends: the time window alone decides, so an
 * expired deal can never show even if a cache is stale or a nightly job did not run.
 *
 * Scope is the set of rows attached: no product and no category = a store-wide offer; products = product offers;
 * categories = category offers.
 */
export const deals = pgTable("deals", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  /** deal | coupon | promotion (src/modules/deals/types.ts). Only changes the label and icon on the site. */
  type: text("type").notNull().default("deal"),
  description: text("description"),
  /** The Buy-style button of the offer goes through /go/<slug of this link>. Optional. */
  affiliateLinkId: uuid("affiliate_link_id").references(() => affiliateLinks.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  /** Null = no end date. */
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isFeatured: boolean("is_featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  /** draft | published | archived. */
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("deals_ends_at_idx").on(t.endsAt),
  index("deals_merchant_ends_idx").on(t.merchantId, t.endsAt),
  index("deals_featured_sort_idx").on(t.isFeatured, t.sortOrder),
]);

export const coupons = pgTable("coupons", {
  id: id(),
  /** Null = a stand-alone coupon of the merchant. */
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  /** percent (discount_value in basis points: 1500 = 15%) | fixed (minor units of `currency`) | free_shipping | other (value 0). */
  discountType: text("discount_type").notNull().default("percent"),
  discountValue: integer("discount_value").notNull().default(0),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  minSpendMinor: integer("min_spend_minor"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("coupons_deal_idx").on(t.dealId),
  index("coupons_ends_at_idx").on(t.endsAt),
  index("coupons_merchant_ends_idx").on(t.merchantId, t.endsAt),
  /** One row per code per merchant, ignoring case. To run a code again, change the dates of the existing row. */
  uniqueIndex("coupons_merchant_code_uq").on(t.merchantId, sql`upper(${t.code})`),
]);

export const dealProducts = pgTable("deal_products", {
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.dealId, t.productId] }),
  index("deal_products_product_idx").on(t.productId),
]);

export const dealCategories = pgTable("deal_categories", {
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.dealId, t.categoryId] }),
  index("deal_categories_category_idx").on(t.categoryId),
]);
