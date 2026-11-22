-- khushio-sql-phase-7b.sql  (Release 7B: analytics, performance, hardening and launch)
-- THIS FILE CHANGES NOTHING. Release 7B needs no new table, column, index or constraint: page analytics live outside Neon
-- (Vercel Web Analytics), and no index was found to be missing in the build review (every hot query already has one; see
-- docs/PERFORMANCE.md). It exists so the phase scripts keep one-to-one with the releases, and so the optional tuning
-- queries below are in one place when real traffic gives you something to measure.
--
-- Running it only prints the status row at the bottom (and is safe to run any number of times).
--
-- =============================================================================
-- OPTIONAL, AFTER A FEW WEEKS OF REAL TRAFFIC: find slow queries and unused indexes.
-- Copy ONE query at a time into the Neon SQL editor. They only READ. Do not run them from this file.
-- =============================================================================
--
-- 1. Turn on query statistics once (Neon supports it):
--      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--
-- 2. The ten queries that cost the most total time. Add an index only for a query that is both slow (mean_exec_time over
--    about 50 ms) and frequent (calls in the thousands):
--      SELECT calls, round(total_exec_time::numeric, 0) AS total_ms, round(mean_exec_time::numeric, 1) AS mean_ms,
--             rows, left(query, 120) AS query
--      FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
--
-- 3. Indexes that have never been used since statistics were last reset (candidates to drop; keep unique and primary
--    key indexes, and keep any index younger than a month of traffic):
--      SELECT s.relname AS table_name, s.indexrelname AS index_name, s.idx_scan,
--             pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
--      FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
--      WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
--      ORDER BY pg_relation_size(s.indexrelid) DESC;
--
-- 4. The biggest tables (for the Neon storage estimate in docs/PERFORMANCE.md):
--      SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size, n_live_tup AS rows
--      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
--
-- 5. Any new index goes in its own dated file, written like the other phase scripts:
--      CREATE INDEX IF NOT EXISTS ... ;   (never CREATE INDEX CONCURRENTLY inside the SQL editor's single transaction)

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables_in_database,
  'khushio-sql-phase-7b applied (no schema change)' AS status;
