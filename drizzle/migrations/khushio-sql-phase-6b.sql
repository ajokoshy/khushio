-- khushio-sql-phase-6b.sql  (Release 6B: guides, product embeds and the homepage builder)
-- Adds ONE column and ONE index, both on the existing "articles" table (no new tables):
--   articles.type   what kind of piece it is: article, guide, review, comparison or how-to.
--                   Every article that exists today becomes 'article' (the column default), so nothing changes for visitors.
--   articles_type_status_publish_idx   (type, status, publish_at): the /guides pages ask for visible items of one or more types.
-- The product embed lives inside the article's JSON text and the homepage builder and navigation editor use the tables
-- homepage_sections and navigation_items that firstload already created, so they need no change here.
-- Safe to run BEFORE the 6B code (the 6A code ignores the new column) and safe to run again.
-- Run on the preview branch first, then production, then merge the pull request.

ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'article' NOT NULL;

CREATE INDEX IF NOT EXISTS "articles_type_status_publish_idx" ON "articles" USING btree ("type","status","publish_at");

-- =============================================================================
-- DONE. Check the result (type column 1, index 1, articles with another type than the five known ones 0):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'type' AND is_nullable = 'NO') AS type_column,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'articles_type_status_publish_idx') AS type_index,
  (SELECT count(*) FROM articles WHERE type NOT IN ('article', 'guide', 'review', 'comparison', 'how-to')) AS unknown_types,
  'khushio-sql-phase-6b applied' AS status;
