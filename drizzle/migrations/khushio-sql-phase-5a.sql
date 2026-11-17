-- khushio-sql-phase-5a.sql  (Release 5A: deals and coupons)
-- Adds four NEW tables and their indexes (nothing existing is changed, so it is safe to run BEFORE the 5A code):
--   deals             the offers: title, store, type, dates, featured flag, manual order, status
--   coupons           coupon codes, either inside a deal or stand-alone for a store
--   deal_products     which products a deal is for (none = not product specific)
--   deal_categories   which categories a deal is for (none = not category specific)
-- A deal is visible only while status = 'published' and now() is between starts_at and ends_at; the code enforces
-- that in every public query, so nothing has to run when a deal ends.
-- Safe to run again. Run on the preview branch first, then production, then merge the pull request.

CREATE TABLE IF NOT EXISTS "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"type" text DEFAULT 'deal' NOT NULL,
	"description" text,
	"affiliate_link_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid,
	"merchant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"discount_type" text DEFAULT 'percent' NOT NULL,
	"discount_value" integer DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"min_spend_minor" integer,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "deal_products" (
	"deal_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "deal_products_deal_id_product_id_pk" PRIMARY KEY("deal_id","product_id")
);

CREATE TABLE IF NOT EXISTS "deal_categories" (
	"deal_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "deal_categories_deal_id_category_id_pk" PRIMARY KEY("deal_id","category_id")
);

-- Foreign keys have no IF NOT EXISTS in Postgres, so each one is wrapped to be skipped when it already exists.
DO $$ BEGIN
  ALTER TABLE "deals" ADD CONSTRAINT "deals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "deals" ADD CONSTRAINT "deals_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "deal_categories" ADD CONSTRAINT "deal_categories_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "deal_categories" ADD CONSTRAINT "deal_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "deals_ends_at_idx" ON "deals" USING btree ("ends_at");
CREATE INDEX IF NOT EXISTS "deals_merchant_ends_idx" ON "deals" USING btree ("merchant_id","ends_at");
CREATE INDEX IF NOT EXISTS "deals_featured_sort_idx" ON "deals" USING btree ("is_featured","sort_order");
CREATE INDEX IF NOT EXISTS "coupons_deal_idx" ON "coupons" USING btree ("deal_id");
CREATE INDEX IF NOT EXISTS "coupons_ends_at_idx" ON "coupons" USING btree ("ends_at");
CREATE INDEX IF NOT EXISTS "coupons_merchant_ends_idx" ON "coupons" USING btree ("merchant_id","ends_at");
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_merchant_code_uq" ON "coupons" USING btree ("merchant_id", upper("code"));
CREATE INDEX IF NOT EXISTS "deal_products_product_idx" ON "deal_products" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "deal_categories_category_idx" ON "deal_categories" USING btree ("category_id");

-- =============================================================================
-- DONE. Check the result (tables 4, indexes 9, foreign keys 8):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('deals', 'coupons', 'deal_products', 'deal_categories')) AS tables_of_4,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('deals_ends_at_idx', 'deals_merchant_ends_idx', 'deals_featured_sort_idx', 'coupons_deal_idx', 'coupons_ends_at_idx', 'coupons_merchant_ends_idx', 'coupons_merchant_code_uq', 'deal_products_product_idx', 'deal_categories_category_idx')) AS indexes_of_9,
  (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conname IN ('deals_merchant_id_merchants_id_fk', 'deals_affiliate_link_id_affiliate_links_id_fk', 'coupons_deal_id_deals_id_fk', 'coupons_merchant_id_merchants_id_fk', 'deal_products_deal_id_deals_id_fk', 'deal_products_product_id_products_id_fk', 'deal_categories_deal_id_deals_id_fk', 'deal_categories_category_id_categories_id_fk')) AS foreign_keys_of_8,
  'khushio-sql-phase-5a applied' AS status;
