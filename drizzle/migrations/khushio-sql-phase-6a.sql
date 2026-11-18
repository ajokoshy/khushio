-- khushio-sql-phase-6a.sql  (Release 6A: articles, pages and the editor)
-- Adds seven NEW tables and their indexes (nothing existing changes, so it is safe to run BEFORE the 6A code):
--   author_profiles     who an article is written by (name, bio)
--   content_categories  article topics
--   content_tags        article tags
--   articles            the articles: JSON editor document, status, go-live time, author, topic, cover image
--   article_tags        which tags an article has
--   pages               stand-alone pages (about, how we earn money, ...), same editor and statuses
--   seo_metadata        search-engine title, description, canonical, share image and robots per article or page
-- Content is stored as JSON (the editor document), never as HTML. An article is visible while status = 'PUBLISHED' or
-- (status = 'SCHEDULED' and publish_at <= now()); the code enforces that in every public query.
-- Safe to run again. Run on the preview branch first, then production, then merge the pull request.

CREATE TABLE IF NOT EXISTS "author_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_profiles_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "content_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_categories_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "content_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_tags_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"publish_at" timestamp with time zone,
	"author_id" uuid,
	"category_id" uuid,
	"cover_public_id" text,
	"cover_alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "article_tags" (
	"article_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "article_tags_article_id_tag_id_pk" PRIMARY KEY("article_id","tag_id")
);

CREATE TABLE IF NOT EXISTS "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"publish_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "seo_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"title" text,
	"description" text,
	"canonical" text,
	"og_image" text,
	"robots" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_author_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."author_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_content_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_id_content_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."content_tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "content_categories_name_uq" ON "content_categories" USING btree (lower("name"));
CREATE UNIQUE INDEX IF NOT EXISTS "content_tags_name_uq" ON "content_tags" USING btree (lower("name"));
CREATE INDEX IF NOT EXISTS "articles_status_publish_idx" ON "articles" USING btree ("status","publish_at");
CREATE INDEX IF NOT EXISTS "articles_category_idx" ON "articles" USING btree ("category_id");
CREATE INDEX IF NOT EXISTS "articles_author_idx" ON "articles" USING btree ("author_id");
CREATE INDEX IF NOT EXISTS "article_tags_tag_idx" ON "article_tags" USING btree ("tag_id");
CREATE INDEX IF NOT EXISTS "pages_status_publish_idx" ON "pages" USING btree ("status","publish_at");
-- One SEO row per article or page.
CREATE UNIQUE INDEX IF NOT EXISTS "seo_entity_uq" ON "seo_metadata" USING btree ("entity_type","entity_id");

-- =============================================================================
-- DONE. Check the result (tables 7, indexes 9, foreign keys 4):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('author_profiles', 'content_categories', 'content_tags', 'articles', 'article_tags', 'pages', 'seo_metadata')) AS tables_of_7,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('content_categories_name_uq', 'content_tags_name_uq', 'articles_status_publish_idx', 'articles_category_idx', 'articles_author_idx', 'article_tags_tag_idx', 'pages_status_publish_idx', 'seo_entity_uq', 'article_tags_article_id_tag_id_pk')) AS indexes_of_9,
  (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conname IN ('articles_author_id_author_profiles_id_fk', 'articles_category_id_content_categories_id_fk', 'article_tags_article_id_articles_id_fk', 'article_tags_tag_id_content_tags_id_fk')) AS foreign_keys_of_4,
  'khushio-sql-phase-6a applied' AS status;
