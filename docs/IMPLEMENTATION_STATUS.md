# Status

Last updated at the end of the Release 2B review. **Built and verified up to Release 2B.** Next: Release 3A.

## Phase 1: foundation (done)
Structure, design tokens, layout shell, env validation, Drizzle schema (29 tables), health endpoint, robots/sitemap, security headers, Vitest setup.

## Release 2A: sign-in and permissions (done, login model changed by the owner)
Auth.js credentials sign-in with JWT sessions, bcryptjs, `/admin-login`, role matrix + `requirePermission` / `requirePagePermission`, middleware redirect, `seed-rbac`, `/api/admin/me`. Details: `docs/AUTH.md`.

**Login model (decided by the owner, keep as is):** the admin's email and bcrypt password hash are read from the `users` table. There is no `ADMIN_EMAIL` / password in env or code and no create-admin script. The admin is created or changed with `drizzle/migrations/set-admin.sql`. Every active user is a super admin.

## Release 2B: admin shell, audit log, CI, Playwright (done)
- Layouts: root is bare; `(public)` has the site header/footer; `(auth)` is plain; `admin` has the shell (sidebar + top bar, mobile drawer) driven by `src/shared/navigation/admin-nav.ts`.
- Shared admin components in `src/shared/admin`: `DataTable`, `ListToolbar`, `Pagination` (URL parameters, server-side), `FormField`, `ConfirmDialog`, `ToastProvider`/`useToast`, `EmptyState`.
- `core/audit`: `logAudit`, `logAuditMany`, `listAuditLogs`; viewer at `/admin/audit` (`audit:view`). Sign-in and sign-out write `auth.login_success` and `auth.logout`.
- Dashboard counts (products, affiliate links, non-bot clicks in 7 days), cached 60 s (tag `dashboard`).
- Playwright (desktop + Pixel 5) and GitHub Actions CI (typecheck, lint, tests, build, then browser tests).
- Docs: AUTH, SECURITY, DEPLOYMENT, ENVIRONMENT, MODULES, DATABASE, PERFORMANCE, ARCHITECTURE.

## Database scripts (changed in the 2B review)
`drizzle/migrations/` now holds `khushio-sql-firstload.sql` (run first, re-runnable, current to 2B), `set-admin.sql` (admin user) and, from 3A on, one `khushio-sql-phase-<release>.sql` per release. The duplicate `0000_init.sql`, the drizzle-kit `meta/` folder and the `db:generate` / `db:migrate` scripts were removed. See `drizzle/migrations/README.md`.

## Changes made in the 2B review
- Docs, `.env.example`, README and CI no longer mention a create-admin script, login throttling that did not exist, ADMIN_EMAIL, analyst users or an E2E seed script.
- `set-admin.sql` rewritten: placeholders only, input checks, lower-cased email, change-password / change-email / hash modes. **The copy supplied contained a real email and plain password: change that password.**
- `khushio-sql-firstload.sql` rewritten to be safe to re-run (IF NOT EXISTS, guarded enum and foreign keys).
- Sign-in: unknown emails now cost the same time as wrong passwords; sign-in and sign-out write audit rows (the e2e test already expected the first).
- After login the user now lands on the admin page they asked for (the absolute `callbackUrl` from middleware was being discarded).
- Removed the unused `ADMIN_EMAIL` / `ADMIN_NAME` env schema entries and the analyst e2e test (no analyst user can exist).
- New tests (60 unit tests in total, was 30): auth service, `$2a$` bcrypt compatibility, redirect safety, SQL scripts applied twice to an embedded Postgres and compared with the Drizzle schema, RBAC seed, `set-admin.sql` behaviour. New dev dependency: `@electric-sql/pglite`.

## Verified in the review environment
typecheck, lint, 60 unit tests, `next build` (compiles; the Google Fonts download needs internet, so it was checked with fonts stubbed), HTTP smoke test of the production build (health, signed-out redirect, 401 API, no registration routes, robots). SQL scripts run twice on a real Postgres engine.
**Not run here:** Playwright (browser download blocked), sign-in against a real Neon database. Run `npm run build` once on your machine and the smoke checklist in `docs/AUTH.md` on the preview URL.

## Carry-over items (not done yet)
1. **Login rate limiting** (in the original 2A scope, never built). Add a Vercel Firewall rule now; build the database-backed limiter in Release 3A's first session or at the latest before 7B.
2. Integration tests against a Neon test branch (`TEST_DATABASE_URL` is reserved). Start in 3A.
3. Branch protection on `main` requiring the two CI checks (needs the first green CI run).
4. Cost numbers for 2A and 2B in `docs/PERFORMANCE.md`.

## Next three tasks
1. Run the checks and smoke test, tag `phase-2b`.
2. Release 3A: categories, brands, merchants admin, with `khushio-sql-phase-3a.sql`.
3. Release 3B: products, variants, Cloudinary uploads, with `khushio-sql-phase-3b.sql`.
