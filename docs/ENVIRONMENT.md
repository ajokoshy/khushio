# Environment variables

Validated in `src/core/config/env.ts` (Zod). Empty values count as unset. Never import `env.ts` from a client component.

| Variable | Where | Required | Notes |
| --- | --- | --- | --- |
| NEXT_PUBLIC_SITE_URL | all | yes (defaults to localhost) | Real domain in Production |
| DATABASE_URL | app, scripts, CI | yes at runtime | Neon **pooled** string (the app reads the admin login from this database) |
| DATABASE_URL_UNPOOLED | local only | no | Neon **direct** string, only for `npm run db:studio`. Not needed in Vercel. Schema changes are SQL files pasted into the Neon SQL Editor |
| AUTH_SECRET | Vercel | yes | 32+ chars. Different for Preview and Production. Changing it signs every admin out and (Release 2C) also resets the login rate-limit counters, because they are keyed with it |
| AUTH_TRUST_HOST | Vercel | yes | `true` |
| TEST_DATABASE_URL | local, CI | no | Neon `test` branch. `tests/integration/neon-smoke.test.ts` runs when it is set and checks the branch has every table and the 2C and 3A additions (read-only). The other integration tests use an embedded Postgres and need nothing |
| E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD | local, CI | no | Playwright admin (`e2e-admin@example.test`), created on the Neon **test** branch with `set-admin.sql`. Enables signed-in browser tests |
| E2E_BASE_URL | local, CI | no | Run Playwright against an existing URL (for example a preview) instead of starting a server |
| CLOUDINARY_CLOUD_NAME, _API_KEY, _API_SECRET | Vercel | from Phase 3B | Secret is server-only |
| CRON_SECRET | Vercel | from Phase 4B | Protects the daily roll-up route |

Rule: nothing secret has a `NEXT_PUBLIC_` prefix.

The admin's own email and password are **not** environment variables: they are a row in the `users` table (`drizzle/migrations/set-admin.sql`).
