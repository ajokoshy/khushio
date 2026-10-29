# Database changes

Every time the database changes, do all three, in the same commit:
1. Add `db/migrations/NNN_short_name.sql` (use `IF NOT EXISTS`, so it is safe to re-run).
2. Update `db/schema.sql` so it always holds the full current schema.
3. Update `lib/db/schema.ts` (the typed version the app uses).

Run new migrations in the Neon SQL Editor. Applied so far: 001, 002, 003, 004, 005, 007 (007 audit log; 003 products.image_url; 004 brands; 005 categories; 006 merchants and collections).
