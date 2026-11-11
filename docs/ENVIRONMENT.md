# Environment variables

Validated in `src/core/config/env.ts` (Zod). Empty values count as unset. Never import `env.ts` from a client component.

| Variable | Where | Required | Notes |
| --- | --- | --- | --- |
| NEXT_PUBLIC_SITE_URL | all | yes (defaults to localhost) | Real domain in Production |
| DATABASE_URL | app, scripts, CI | yes at runtime | Neon **pooled** string |
| DATABASE_URL_UNPOOLED | local only | for migrations | Neon **direct** string; used by `drizzle-kit migrate`. Not needed in Vercel |
| AUTH_SECRET | Vercel, scripts | yes | 32+ chars. Different for Preview and Production. Also keys the login rate-limit hashes, so use the production value when running scripts against production |
| AUTH_TRUST_HOST | Vercel | yes | `true` |
| ADMIN_EMAIL, ADMIN_NAME | local only | no | Convenience for `npm run auth:create-admin`. Never in Vercel. The password is only ever typed at the prompt |
| TEST_DATABASE_URL | local, CI | no | Neon `test` branch; enables integration tests |
| E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD | local, CI | no | Playwright super admin (`@example.test` address). Enables signed-in browser tests |
| E2E_ANALYST_EMAIL / E2E_ANALYST_PASSWORD | local, CI | no | Playwright analyst for the 403 test |
| E2E_SEED_CONFIRM | local, CI | for seeding | Must be `yes`; guards `npm run test:e2e:seed` |
| E2E_BASE_URL | local, CI | no | Run Playwright against an existing URL (for example a preview) instead of starting a server |
| CLOUDINARY_CLOUD_NAME, _API_KEY, _API_SECRET | Vercel | from Phase 3B | Secret is server-only |
| CRON_SECRET | Vercel | from Phase 4B | Protects the daily roll-up route |

Rule: nothing secret has a `NEXT_PUBLIC_` prefix.
