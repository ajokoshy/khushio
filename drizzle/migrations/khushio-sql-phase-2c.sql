-- khushio-sql-phase-2c.sql  (Release 2C: login rate limiting)
-- Adds: the login_attempts table (keyed hashes of email and IP, one row per failed sign-in) and
--       its two lookup indexes. New table only, so it is safe to run BEFORE the 2C code is deployed:
--       the old code simply never touches it.
-- Safe to run again. Run on the preview branch first, then production, then merge the pull request.

CREATE TABLE IF NOT EXISTS "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "login_attempts_email_idx" ON "login_attempts" USING btree ("email_hash","created_at");
CREATE INDEX IF NOT EXISTS "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_hash","created_at");

-- =============================================================================
-- DONE. Check the result (should show the table, 2 indexes and status):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'login_attempts') AS login_attempts_table,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'login_attempts' AND indexname IN ('login_attempts_email_idx', 'login_attempts_ip_idx')) AS indexes,
  'khushio-sql-phase-2c applied' AS status;
