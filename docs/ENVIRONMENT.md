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
| CLOUDINARY_CLOUD_NAME, _API_KEY, _API_SECRET | Vercel | from Release 3B | Needed for image uploads and for showing images. Without them uploads are switched off (the product screen says so) and pages show a placeholder. Secret is server-only |
| NEXT_PUBLIC_ANALYTICS | Vercel (Production) | from Release 7B | `off` (default) or `vercel`. `vercel` loads Vercel Web Analytics and Speed Insights on public pages (cookie-free, nothing stored in Neon, search words stripped). Also switch both on in the Vercel dashboard. Needs a redeploy |
| CSP_ENFORCE | Vercel (Production) | from Release 7B | `true` makes the Content-Security-Policy enforced; anything else keeps it report-only. Needs a redeploy. Turn on after a week of quiet `khushio.csp` log lines |
| CRON_SECRET | Vercel (Preview and Production) | from Release 4B | 16+ characters (`openssl rand -base64 32`). Vercel Cron sends it as `Authorization: Bearer <value>` to `/api/cron/affiliate-rollup`. Without it the route answers 401 to everyone and nothing is rolled up or purged |

Rule: nothing secret has a `NEXT_PUBLIC_` prefix.

The admin's own email and password are **not** environment variables: they are a row in the `users` table (`drizzle/migrations/set-admin.sql`).

## GitHub Actions secrets (Release 7B, all optional)
| Secret | Used by | Notes |
| --- | --- | --- |
| BACKUP_DATABASE_URL | `.github/workflows/backup.yml` | The **unpooled** Neon connection string of the production branch, ideally for a read-only role |
| BACKUP_PASSPHRASE | `.github/workflows/backup.yml` | Encrypts the dump (AES-256). Keep it in your password manager: without it the backup cannot be opened |
