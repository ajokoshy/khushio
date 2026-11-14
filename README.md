# Khushio

Discover More. Save More. Live Happier. A modular-monolith Next.js platform, affiliate-first.

## Quick start
```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL (Neon pooled string) and AUTH_SECRET
```
Database (Neon SQL Editor, correct branch; every file is safe to re-run):
1. Run `drizzle/migrations/khushio-sql-firstload.sql` (tables, indexes, roles, permissions).
2. Edit and run `drizzle/migrations/set-admin.sql` (creates the admin user; the sign-in checks this table).
3. Run each later `khushio-sql-phase-<release>.sql` in order, once per release (today `phase-2c`, `phase-3a`, `phase-3b`, then `phase-3c`).

```bash
npm run dev                  # then open /admin-login
npm run db:seed-dev -- --yes # optional, DEVELOPMENT databases only: starter categories, brands, merchants
```
Checks: `npm run typecheck && npm run lint && npm test && npm run build`

See `drizzle/migrations/README.md` for the database script rules and `docs/` for architecture, auth,
deployment and status. Never commit or share credentials.
