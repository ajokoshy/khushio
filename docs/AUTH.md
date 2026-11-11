# Authentication and permissions (Release 2A)

## How it fits together
- `src/core/auth/config.ts`: edge-safe Auth.js config (used by middleware). Session = JWT, 8 hours.
- `src/core/auth/index.ts`: Credentials provider; `authorize` calls `service.authenticate`.
- `src/core/auth/service.ts` -> `repository.ts`: the only code that touches the database for auth.
- `src/core/permissions`: `keys.ts` (typed keys), `matrix.ts` (roles -> keys), `guard.ts` (pure checks), `require.ts` (server helpers), `repository.ts` (seed sync).
- Middleware only redirects. Every action, route handler and admin page must call `requirePermission` or `requirePagePermission`.

## Using the guards
```ts
// server action or route handler
const session = await requirePermission(PERMISSIONS.productWrite);          // throws 401/403
const session = await requirePermission(PERMISSIONS.userManage, { fresh: true }); // re-checks the database

// route handler error mapping
try { ... } catch (e) { return errorResponse(e); }                          // "@/core/errors/http"

// server-rendered admin page
await requirePagePermission(PERMISSIONS.productRead);                       // redirect to login or 403 page
```
To add a permission: add it to `keys.ts` (key + description), grant it in `matrix.ts`, run `npm run db:seed-rbac`.

## Roles
| Role | Can do |
| --- | --- |
| super_admin | everything, including user:manage and settings:manage |
| catalog_manager | products, categories, brands, merchants, affiliate, deals, media, imports |
| editor | articles/pages (write, publish), media, SEO, homepage, view products |
| analyst | dashboard, reports, read products and affiliate links |

## Login protection
5 failed attempts per email or 20 per IP within 15 minutes blocks further attempts (even with the right password) until the window passes. Failures are rows in `audit_logs` (`auth.login_failed`, entity `login_attempt`, HMAC-hashed keys). Trade-off: someone can lock a known admin email out for 15 minutes; they cannot get in. Prune old `login_attempt` rows in Phase 4B/7B.

## Setup per environment
1. `npm install`, then fill `.env.local` (`AUTH_SECRET`, `AUTH_TRUST_HOST=true`, Neon strings). Preview and Production need different `AUTH_SECRET` values in Vercel.
2. Seed roles and permissions: `npm run db:seed-rbac`.
3. Create the first admin: `npm run auth:create-admin` (hidden password prompt, minimum 12 characters).
4. Production: run both scripts from your machine only, with the production pooled string passed inline:
   `DATABASE_URL="..." AUTH_SECRET="<production secret>" npm run db:seed-rbac`
   The admin password is never stored in Vercel. `ADMIN_EMAIL`/`ADMIN_NAME` are optional local conveniences.
5. Lost access: `npm run auth:create-admin -- --reset-password`.

## Checks
`npm run typecheck && npm run lint && npm test && npm run build`
Integration tests: set `TEST_DATABASE_URL` to a dedicated Neon test branch (migrations applied), then `npm test`.

## Smoke checklist (preview, then production)
- Signed out: `/admin/dashboard` redirects to `/admin-login?callbackUrl=...`.
- Signed out: `GET /api/admin/me` returns 401.
- Wrong password shows "Invalid email or password."; the sixth bad try shows the "Too many failed attempts" message.
- Correct password lands on `/admin/dashboard`; "Sign out" returns to `/admin-login`.
- Signed in as `analyst`: `/api/admin/me` returns 200; a page or action needing `product:write` returns 403.
- `/admin-login?callbackUrl=https://evil.com` signs in and lands on the dashboard, not evil.com.
- There is no sign-up page or route.

## Browser tests (Release 2B)
`npm run test:e2e` starts the app and runs Playwright (first time: `npx playwright install chromium`).
- Tests that need no database always run: signed-out redirect, 401 from the API, no registration, wrong password.
- Signed-in tests (sign-in/out, navigation, audit rows, mobile shell, analyst 403) run when `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (and `E2E_ANALYST_*`) are set. Create those users on a **test** Neon branch only:
  `E2E_SEED_CONFIRM=yes npm run test:e2e:seed` (needs `DATABASE_URL`, `AUTH_SECRET` and the four E2E variables).
- CI does the same from GitHub secrets (see `docs/DEPLOYMENT.md`).
