# Database (Phase 1)
Schemas in `src/core/database/schema/`: identity, catalog, merchants-affiliate, platform. Migration: `drizzle/migrations/0000_init.sql`.
Conventions: UUID PKs, `timestamptz` UTC, FK everywhere, indexes on lookup/sort columns, JSONB only for settings/config.
Never run destructive migrations automatically; review SQL before `db:migrate`.
