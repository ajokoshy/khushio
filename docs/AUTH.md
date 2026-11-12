# Authentication and permissions (Release 2A; login model as changed after 2A)

## How login works
- The admin's **email and password hash are stored in the database**, in the `users` table (`email`, `password_hash` = bcrypt, `is_active`). The login page's "username" is the email address. There are **no admin credentials in environment variables, Vercel settings or code**.
- Create or change the admin with `drizzle/migrations/set-admin.sql` (run it in the Neon SQL Editor; safe to re-run). See `drizzle/migrations/README.md`.
- Every **active** row in `users` is a full administrator (`super_admin`, all permissions). `user_roles` is not read at sign-in. Setting `is_active = false` disables a user.
- There is no public registration, no sign-up route and no create-admin script.

Sign-in steps (`src/core/auth/service.ts`): validate the form with Zod (email trimmed and lower-cased) -> `findUserByEmail` -> bcrypt-compare the password (an unknown email is compared against a throwaway hash, so timing does not reveal which emails exist) -> reject inactive users -> update `last_login_at` -> write an `auth.login_success` audit row -> return the user with the owner role and every permission key. Sign-out writes `auth.logout`. A failed audit write is logged and never blocks sign-in.

## How it fits together
- `src/core/auth/config.ts`: edge-safe Auth.js config (used by middleware). Session = JWT, 8 hours, secure HTTP-only cookie.
- `src/core/auth/index.ts`: Credentials provider; `authorize` calls `service.authenticate`.
- `src/core/auth/service.ts` -> `repository.ts`: the only code that touches the database for auth.
- `src/core/permissions`: `keys.ts` (typed keys), `matrix.ts` (roles -> keys), `guard.ts` (pure checks), `require.ts` (server helpers), `repository.ts` (RBAC sync).
- Middleware only redirects. Every action, route handler and admin page must call `requirePermission` or `requirePagePermission`.
- After sign-in the user returns to the admin page they asked for (only `/admin/...` paths are honoured, see `src/core/security/redirects.ts`).

## Using the guards
```ts
// server action or route handler
const session = await requirePermission(PERMISSIONS.productWrite);          // throws 401/403
const session = await requirePermission(PERMISSIONS.userManage, { fresh: true }); // re-checks is_active in the database

// route handler error mapping
try { ... } catch (e) { return errorResponse(e); }                          // "@/core/errors/http"

// server-rendered admin page
await requirePagePermission(PERMISSIONS.productRead);                       // redirect to login or 403 page
```
To add a permission: add it to `keys.ts` (key + description), grant it in `matrix.ts`, and add the INSERT to that release's `khushio-sql-phase-<release>.sql` (the test `sql-scripts.test.ts` fails until the SQL seed and the matrix agree). Because permissions are copied into the session token at sign-in, **sign out and in again after a deploy that adds permission keys**.

## Roles
The matrix still defines four roles. Today only `super_admin` is used (by every active user); the others are reserved in case you later add staff with limited access, which would mean reading `user_roles` in `service.ts`.

| Role | Can do |
| --- | --- |
| super_admin | everything, including user:manage and settings:manage |
| catalog_manager | products, categories, brands, merchants, affiliate, deals, media, imports |
| editor | articles/pages (write, publish), media, SEO, homepage, view products |
| analyst | dashboard, reports, read products and affiliate links |

## Setup per environment
1. `npm install`; fill `.env.local` (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`). Preview and Production use different `AUTH_SECRET` values in Vercel.
2. Neon SQL Editor, correct branch: run `drizzle/migrations/khushio-sql-firstload.sql`.
3. Edit and run `drizzle/migrations/set-admin.sql` (email, name, password). For production prefer a pre-made hash: `npm run auth:hash-password`, paste the hash into `v_password_hash`.
4. Restore the placeholders in `set-admin.sql` before you save or commit it. Never commit a real email, password or hash.
5. Lost access or changing the password or email: run `set-admin.sql` again.
6. Cut off every signed-in session at once: change `AUTH_SECRET` in Vercel and redeploy.

## Known gap
There is **no login rate limiting yet** (it was in the original 2A plan and is carried over, see the project guide). Until it is built, add a Vercel Firewall rate-limit rule for `POST /api/auth/callback/credentials` and `/admin-login` (Vercel, Settings, Firewall), and use a long password.

## Checks
`npm run typecheck && npm run lint && npm test && npm run build`
`npm test` also applies the SQL scripts to an embedded Postgres and checks `set-admin.sql`, so no Neon connection is needed for those tests.

## Smoke checklist (preview, then production)
- Signed out: `/admin/dashboard` redirects to `/admin-login?callbackUrl=...`.
- Signed out: `GET /api/admin/me` returns 401.
- Wrong password and unknown email both show "Invalid email or password."
- Correct password lands on the page you asked for (default `/admin/dashboard`); "Sign out" returns to `/admin-login`.
- `/admin/audit` shows `auth.login_success` and `auth.logout` rows.
- A user set `is_active = false` cannot sign in.
- `/admin-login?callbackUrl=https://evil.com` signs in and lands on the dashboard, not evil.com.
- There is no sign-up page or route.

## Browser tests (Release 2B)
`npm run test:e2e` starts the app and runs Playwright (first time: `npx playwright install chromium`).
- Always run, no database: signed-out redirect, 401 from the API, no registration, wrong password.
- Signed-in tests (sign-in/out, navigation, audit rows, mobile shell) run when `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are set. Create that user on a **test** Neon branch only: run `khushio-sql-firstload.sql`, then `set-admin.sql` with `e2e-admin@example.test` and the password you store as the `E2E_ADMIN_PASSWORD` secret.
- There is no analyst browser test: every active user is a super admin. Role limits are covered by the unit tests of the permission matrix and guard.
- CI does the same from GitHub secrets (see `docs/DEPLOYMENT.md`).
