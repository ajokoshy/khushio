# Database scripts

Khushio's database is built and upgraded with plain SQL files that you paste into the Neon SQL Editor
(or any Postgres client). Every file is **safe to run again**: it never drops tables or data, and
running it twice leaves the database exactly as running it once.

There is no `drizzle-kit migrate` step. The Drizzle schema in `src/core/database/schema/*.ts` is the
source of truth for the app; the SQL files here are how that schema reaches a real database.
A unit test (`tests/unit/sql-scripts.test.ts`) applies every file to an embedded Postgres twice and
fails if the result differs from the Drizzle schema, so the two cannot drift apart unnoticed.

## Files, in the order you run them

| Order | File | Purpose | When |
| --- | --- | --- | --- |
| 1 | `khushio-sql-firstload.sql` | Everything that exists up to Release 2B: extension, all tables, foreign keys, indexes, roles and permissions | Once per new database (any host). Re-running is harmless |
| 2 | `set-admin.sql` | Creates the admin user, or changes the admin's password, name or email | After firstload, and whenever you need to change the admin |
| 3 | `khushio-sql-phase-2c.sql` | Release 2C: `login_attempts` table for login rate limiting | Once, before deploying 2C |
| 4 | `khushio-sql-phase-3a.sql` | Release 3A: `brands.is_active`, unique category name per parent | Once, before deploying 3A |
| later | `khushio-sql-phase-<release>.sql` | The database changes of one release, for example `khushio-sql-phase-3a.sql` | Once per release, in release order, **before** deploying that release's code |

`firstload` is never edited again after Release 2B. Each later release adds its **own** file (even a
release with no schema change gets a small file with a comment and the status query, so the list
always shows which releases your database has seen).

## Running a file

1. Neon console, open the right **branch** (preview or production), then **SQL Editor**.
2. Paste the whole file and press Run.
3. Read the result grid at the bottom of the file (each file ends with a status query).
4. Production only: first create a Neon branch from production named `backup-<release>-<date>`.

A new empty database needs `khushio-sql-firstload.sql`, then `set-admin.sql`, then every
`khushio-sql-phase-*.sql` in name order (today: `phase-2c`, then `phase-3a`).

## Rules for writing a release script (for Claude and for you)

- Name: `khushio-sql-phase-<release>.sql`, lower case (`phase-3b`, `phase-5a`, `phase-8`).
- Additive only: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  `CREATE [UNIQUE] INDEX IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`, seed rows with
  `INSERT ... ON CONFLICT DO NOTHING/UPDATE`. Never `DROP` or change a column type in the same
  release that adds the replacement (expand first, contract in a later release).
- Foreign keys and enum types have no `IF NOT EXISTS` in Postgres, so wrap them like firstload does:
  `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- Start the file with a header (release, what it adds, which code needs it) and end with a
  `SELECT ... AS status` that proves it worked.
- Update the Drizzle schema in the same change. `npm test` then proves the files and the schema agree.
- Document the file in the release's section of the project guide and in `docs/DATABASE.md`.

## Template

```sql
-- khushio-sql-phase-3b.sql  (Release 3B: products, variants, Cloudinary uploads)
-- Adds: unique index on media_assets.content_hash, composite index on product_images.
-- Safe to run again. Run BEFORE deploying the Release 3B code.

CREATE UNIQUE INDEX IF NOT EXISTS media_hash_uq ON media_assets (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS images_product_order_idx ON product_images (product_id, sort_order);

SELECT 'khushio-sql-phase-3b applied' AS status;
```

## Security notes

- `set-admin.sql` is committed **with placeholders only**. Edit the values in the Neon editor, run,
  and never save a real email or password back into the file or into Git.
- Neon keeps a history of editor queries. To keep the plain password out of it, generate the hash on
  your machine (`npm run auth:hash-password`) and paste only the hash.
