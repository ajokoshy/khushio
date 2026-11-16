-- khushio-sql-phase-4a.sql  (Release 4A: affiliate links and the /go redirect)
-- Adds: NOTHING. Release 4A needs no schema change: affiliate_links, affiliate_clicks, merchant_programs and
-- affiliate_networks already exist since khushio-sql-firstload.sql. This marker file keeps the release list complete,
-- so the files you have run always show which releases your database has seen.
-- Safe to run again. Run BEFORE deploying the Release 4A code (it changes nothing, so the order is not critical).
--
-- What the /go redirect relies on (the status query below proves each one exists):
--   * affiliate_links.slug is unique       -> the redirect's single read is an index lookup
--   * affiliate_clicks has clicks_link_time_idx and clicks_time_idx -> reports and the dashboard count stay fast
--   * merchants.allowed_domains            -> the destination allow-list the redirect enforces

-- =============================================================================
-- DONE. Check the result (every count should be 1 or more, the click and link counts are just information):
-- =============================================================================
SELECT
  (SELECT count(*) FROM pg_constraint WHERE conname = 'affiliate_links_slug_unique') AS link_slug_unique,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('clicks_link_time_idx', 'clicks_time_idx')) AS click_indexes_of_2,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchants' AND column_name = 'allowed_domains') AS allowed_domains_column,
  (SELECT count(*) FROM affiliate_links) AS affiliate_links_now,
  (SELECT count(*) FROM affiliate_clicks) AS raw_clicks_now,
  'khushio-sql-phase-4a applied (no schema change)' AS status;
