-- =============================================================================
-- khushio-sql-firstload.sql
-- Khushio initial database script. RUN THIS FIRST on any new database (Neon, local, any host).
-- Current as of Release 2B. Safe to run again: it never drops or overwrites data.
-- =============================================================================
-- WHAT IT DOES
--   PART 0  Enables the pgcrypto extension (needed by set-admin.sql).
--   PART 1  Creates every table, foreign key and index that exists up to Release 2B.
--   PART 2  Seeds roles, permissions and role grants (same as src/core/permissions/matrix.ts).
--
-- HOW TO USE (Neon: SQL Editor, pick the right branch, paste the whole file, Run)
--   1. Run this file.                                   -> khushio-sql-firstload.sql
--   2. Create the admin user.                           -> set-admin.sql
--   3. For every later release, run its own file, in order:  khushio-sql-phase-3a.sql,
--      khushio-sql-phase-3b.sql, ... (each is safe to re-run). See drizzle/migrations/README.md.
--
-- This file is NOT regenerated per release. Later releases add their own files instead.
-- The schema source of truth is src/core/database/schema/*.ts; a unit test
-- (tests/unit/sql-scripts.test.ts) fails if these scripts and the schema ever disagree.
-- =============================================================================


-- =============================================================================
-- PART 0: EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- PART 1: SCHEMA
-- =============================================================================

-- Enum types
DO $$ BEGIN
  CREATE TYPE "public"."product_status" AS ENUM('DRAFT', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'DISCONTINUED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);

CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);

CREATE TABLE IF NOT EXISTS "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "collection_products" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_products_collection_id_product_id_pk" PRIMARY KEY("collection_id","product_id")
);

CREATE TABLE IF NOT EXISTS "product_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);

CREATE TABLE IF NOT EXISTS "product_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_collections_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"alt" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_tags" (
	"product_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "product_tags_product_id_tag_pk" PRIMARY KEY("product_id","tag")
);

CREATE TABLE IF NOT EXISTS "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text,
	"label" text NOT NULL,
	"price_minor" integer,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"description" text,
	"brand_id" uuid,
	"status" "product_status" DEFAULT 'DRAFT' NOT NULL,
	"publish_at" timestamp with time zone,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "affiliate_click_daily" (
	"link_id" uuid NOT NULL,
	"day" date NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "affiliate_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sub_id" text,
	"referrer_host" text,
	"country" char(2),
	"is_bot" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "affiliate_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid,
	"network_id" uuid,
	"external_order_id" text,
	"commission_minor" integer DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"converted_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "affiliate_import_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"rows_failed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "affiliate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"product_id" uuid,
	"destination_url" text NOT NULL,
	"tracking_params" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_links_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "affiliate_networks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_networks_key_unique" UNIQUE("key")
);

CREATE TABLE IF NOT EXISTS "merchant_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"external_program_id" text,
	"commission_note" text,
	"is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"website_url" text,
	"allowed_domains" text[] DEFAULT '{}' NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "homepage_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"heading" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"publish_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"content_hash" text,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_public_id_unique" UNIQUE("public_id")
);

CREATE TABLE IF NOT EXISTS "navigation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" text NOT NULL,
	"label" text NOT NULL,
	"href" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_product_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."product_collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "affiliate_click_daily" ADD CONSTRAINT "affiliate_click_daily_link_id_affiliate_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_link_id_affiliate_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_link_id_affiliate_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_network_id_affiliate_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."affiliate_networks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "merchant_programs" ADD CONSTRAINT "merchant_programs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "merchant_programs" ADD CONSTRAINT "merchant_programs_network_id_affiliate_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."affiliate_networks"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "audit_logs" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "categories_parent_idx" ON "categories" USING btree ("parent_id");
CREATE INDEX IF NOT EXISTS "attrs_product_idx" ON "product_attributes" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "pc_category_idx" ON "product_categories" USING btree ("category_id");
CREATE INDEX IF NOT EXISTS "images_product_idx" ON "product_images" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "variants_product_idx" ON "product_variants" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "products_status_idx" ON "products" USING btree ("status","publish_at");
CREATE INDEX IF NOT EXISTS "products_brand_idx" ON "products" USING btree ("brand_id");
CREATE UNIQUE INDEX IF NOT EXISTS "click_daily_uq" ON "affiliate_click_daily" USING btree ("link_id","day");
CREATE INDEX IF NOT EXISTS "clicks_link_time_idx" ON "affiliate_clicks" USING btree ("link_id","clicked_at");
CREATE INDEX IF NOT EXISTS "clicks_time_idx" ON "affiliate_clicks" USING btree ("clicked_at");
CREATE UNIQUE INDEX IF NOT EXISTS "conv_external_uq" ON "affiliate_conversions" USING btree ("network_id","external_order_id");
CREATE INDEX IF NOT EXISTS "links_product_idx" ON "affiliate_links" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "links_merchant_idx" ON "affiliate_links" USING btree ("merchant_id");
CREATE INDEX IF NOT EXISTS "programs_merchant_idx" ON "merchant_programs" USING btree ("merchant_id");
CREATE INDEX IF NOT EXISTS "home_sections_order_idx" ON "homepage_sections" USING btree ("sort_order");
CREATE INDEX IF NOT EXISTS "media_hash_idx" ON "media_assets" USING btree ("content_hash");


-- =============================================================================
-- PART 2: RBAC SEED (roles, permissions, grants)
-- =============================================================================

INSERT INTO permissions (key, description) VALUES
  ('dashboard:view', 'See the admin dashboard'),
  ('product:read', 'View products in admin'),
  ('product:write', 'Create and edit products and variants'),
  ('product:publish', 'Publish, schedule and archive products'),
  ('category:write', 'Manage categories'),
  ('brand:write', 'Manage brands'),
  ('merchant:write', 'Manage merchants and allowed domains'),
  ('affiliate:read', 'View affiliate links and networks'),
  ('affiliate:write', 'Manage affiliate networks, programmes and links'),
  ('deal:write', 'Manage deals and coupons'),
  ('content:write', 'Write and edit articles and pages'),
  ('content:publish', 'Publish and schedule articles and pages'),
  ('media:write', 'Upload and manage media'),
  ('seo:write', 'Edit SEO metadata and redirects'),
  ('homepage:write', 'Edit homepage sections and navigation'),
  ('import:run', 'Run CSV imports and exports'),
  ('report:view', 'View click and conversion reports'),
  ('audit:view', 'View the audit log'),
  ('settings:manage', 'Change site settings and feature flags'),
  ('user:manage', 'Manage admin users and roles')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO roles (key, name) VALUES
  ('super_admin', 'Super admin'),
  ('editor', 'Editor'),
  ('catalog_manager', 'Catalog manager'),
  ('analyst', 'Analyst')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('super_admin', 'dashboard:view'),
  ('super_admin', 'product:read'),
  ('super_admin', 'product:write'),
  ('super_admin', 'product:publish'),
  ('super_admin', 'category:write'),
  ('super_admin', 'brand:write'),
  ('super_admin', 'merchant:write'),
  ('super_admin', 'affiliate:read'),
  ('super_admin', 'affiliate:write'),
  ('super_admin', 'deal:write'),
  ('super_admin', 'content:write'),
  ('super_admin', 'content:publish'),
  ('super_admin', 'media:write'),
  ('super_admin', 'seo:write'),
  ('super_admin', 'homepage:write'),
  ('super_admin', 'import:run'),
  ('super_admin', 'report:view'),
  ('super_admin', 'audit:view'),
  ('super_admin', 'settings:manage'),
  ('super_admin', 'user:manage'),
  ('editor', 'dashboard:view'),
  ('editor', 'product:read'),
  ('editor', 'content:write'),
  ('editor', 'content:publish'),
  ('editor', 'media:write'),
  ('editor', 'seo:write'),
  ('editor', 'homepage:write'),
  ('catalog_manager', 'dashboard:view'),
  ('catalog_manager', 'product:read'),
  ('catalog_manager', 'product:write'),
  ('catalog_manager', 'product:publish'),
  ('catalog_manager', 'category:write'),
  ('catalog_manager', 'brand:write'),
  ('catalog_manager', 'merchant:write'),
  ('catalog_manager', 'affiliate:read'),
  ('catalog_manager', 'affiliate:write'),
  ('catalog_manager', 'deal:write'),
  ('catalog_manager', 'media:write'),
  ('catalog_manager', 'import:run'),
  ('analyst', 'dashboard:view'),
  ('analyst', 'product:read'),
  ('analyst', 'affiliate:read'),
  ('analyst', 'report:view')
) AS g(role_key, permission_key)
JOIN roles r ON r.key = g.role_key
JOIN permissions p ON p.key = g.permission_key
ON CONFLICT DO NOTHING;


-- =============================================================================
-- DONE. Check the result (should list 29 tables, 20 permissions, 4 roles):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
  (SELECT count(*) FROM permissions) AS permissions,
  (SELECT count(*) FROM roles) AS roles,
  'khushio-sql-firstload applied' AS status;
