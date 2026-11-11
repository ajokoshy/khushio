import { pgTable, text, uuid, integer, boolean, index, uniqueIndex, date, timestamp, char } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./_shared";
import { products } from "./catalog";

export const merchants = pgTable("merchants", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  /** Approved domains: the /go redirect refuses any destination outside this list. */
  allowedDomains: text("allowed_domains").array().notNull().default([]),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const affiliateNetworks = pgTable("affiliate_networks", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const merchantPrograms = pgTable("merchant_programs", {
  id: id(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  networkId: uuid("network_id").notNull().references(() => affiliateNetworks.id, { onDelete: "restrict" }),
  externalProgramId: text("external_program_id"),
  commissionNote: text("commission_note"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("programs_merchant_idx").on(t.merchantId)]);

export const affiliateLinks = pgTable("affiliate_links", {
  id: id(),
  slug: text("slug").notNull().unique(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  destinationUrl: text("destination_url").notNull(),
  trackingParams: text("tracking_params"),
  isActive: boolean("is_active").notNull().default(true),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("links_product_idx").on(t.productId), index("links_merchant_idx").on(t.merchantId)]);

/** Raw events with short retention. No full IP addresses are stored. */
export const affiliateClicks = pgTable("affiliate_clicks", {
  id: id(),
  linkId: uuid("link_id").notNull().references(() => affiliateLinks.id, { onDelete: "cascade" }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  subId: text("sub_id"),
  referrerHost: text("referrer_host"),
  country: char("country", { length: 2 }),
  isBot: boolean("is_bot").notNull().default(false),
}, (t) => [index("clicks_link_time_idx").on(t.linkId, t.clickedAt), index("clicks_time_idx").on(t.clickedAt)]);

/** Daily roll-up kept long-term so raw clicks can be purged. */
export const affiliateClickDaily = pgTable("affiliate_click_daily", {
  linkId: uuid("link_id").notNull().references(() => affiliateLinks.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  clicks: integer("clicks").notNull().default(0),
}, (t) => [uniqueIndex("click_daily_uq").on(t.linkId, t.day)]);

export const affiliateConversions = pgTable("affiliate_conversions", {
  id: id(),
  linkId: uuid("link_id").references(() => affiliateLinks.id, { onDelete: "set null" }),
  networkId: uuid("network_id").references(() => affiliateNetworks.id, { onDelete: "set null" }),
  externalOrderId: text("external_order_id"),
  commissionMinor: integer("commission_minor").notNull().default(0),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  status: text("status").notNull().default("pending"),
  convertedAt: timestamp("converted_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("conv_external_uq").on(t.networkId, t.externalOrderId)]);

export const affiliateImportLogs = pgTable("affiliate_import_logs", {
  id: id(),
  source: text("source").notNull(),
  rowsProcessed: integer("rows_processed").notNull().default(0),
  rowsFailed: integer("rows_failed").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
