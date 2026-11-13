# Status

**Standing instruction for Claude:** every time you deliver a new code zip, deliver the updated project guide (Khushio_Project_Guide_and_Phased_Roadmap.docx) in the same reply: raise the version and the "built up to" line, update section 2 (status and what was verified), the release's own section, sections 7.5 and 8, section 19, and say what was not run. See guide section 5, rule 7.

Last updated at the end of Releases 2C and 3A. **Built up to Release 3A.** Next: Release 3B (products, variants, Cloudinary uploads).

## Phase 1: foundation (done)
Structure, design tokens, layout shell, env validation, Drizzle schema, health endpoint, robots/sitemap, security headers, Vitest setup.

## Release 2A: sign-in and permissions (done, login model changed by the owner)
Auth.js credentials sign-in with JWT sessions, bcryptjs, `/admin-login`, role matrix + `requirePermission` / `requirePagePermission`, middleware redirect, `seed-rbac`, `/api/admin/me`. Details: `docs/AUTH.md`.

**Login model (decided by the owner, keep as is):** the admin's email and bcrypt password hash are read from the `users` table. No admin credentials in env or code. The admin is created or changed with `drizzle/migrations/set-admin.sql`. Every active user is a super admin. Release 2C did not change this.

## Release 2B: admin shell, audit log, CI, Playwright (done)
Admin shell driven by `ADMIN_NAV`, shared admin components, `core/audit` and `/admin/audit`, dashboard counts, Playwright and GitHub Actions CI.

## Release 2C: login rate limiting (done)
- 5 failed attempts per email or 20 per IP in 15 minutes block sign-in (even with the right password) until they age out; the form says "Too many failed attempts. Try again in 15 minutes."
- Enforced inside `authenticate` (`src/core/auth/service.ts`), so a direct POST to `/api/auth/callback/credentials` is covered too. Pure decision in `src/core/auth/throttle.ts`; table access in `login-throttle.ts` and `repository.ts`.
- New table `login_attempts` (hashes only: HMAC-SHA256 keyed with `AUTH_SECRET`). A successful sign-in clears that email's failures and deletes rows older than 7 days (no cron).
- The unused "failed-login counters" filter was removed from the audit viewer.
- Database script: `drizzle/migrations/khushio-sql-phase-2c.sql` (new table, safe to run before the code).
- Tests: `throttle.test.ts`, extra cases in `auth-service.test.ts`, `tests/integration/login-attempts.test.ts` (real Postgres), SQL checks in `sql-scripts.test.ts`, `tests/e2e/login-throttle.spec.ts` (test branch only).

## Release 3A: categories, brands, merchants (done)
- Modules `discover` (categories, brands) and `merchants`, each with repository, service, validation, types. Admin screens: `/admin/categories`, `/admin/brands`, `/admin/merchants` (list with search, status filter and paging; create; edit; archive, restore, delete). New nav entries (permissions `category:write`, `brand:write`, `merchant:write`).
- Categories: flexible tree with a parent picker, cycle prevention, one name per parent (ignoring case), sort order, "Add subcategory" shortcut.
- Merchants: allowed-domains editor with normalisation and rejection of unsafe entries (`src/modules/merchants/domains.ts`); changes are audited with the domains added and removed.
- Slugs: generated with uniqueness checks; never change silently (confirmation box + audit record). Redirects for changed slugs arrive in 7A.
- Delete rules: archive instead of delete when children or products (categories), products (brands) or links or programmes (merchants) exist.
- Cache tags `categories`, `brands`, `merchants` revalidated on write; category reads cached 24 h.
- Database script: `drizzle/migrations/khushio-sql-phase-3a.sql`: **`brands.is_active` (not in the original 3A plan, needed so brands can be archived)** and the unique category-name index.
- Dev starter data: `npm run db:seed-dev -- --yes` (development databases only).
- Integration tests started: `tests/integration` runs the services and repositories against an embedded Postgres (no secrets); `neon-smoke.test.ts` checks the Neon test branch when `TEST_DATABASE_URL` is set.
- Tests: 200 passing locally (was 60). Playwright: `tests/e2e/catalog-admin.spec.ts`.

## Verified in the build environment
typecheck, lint, 200 tests (including the SQL scripts and repositories on a real embedded Postgres), and `next build` (compiles all routes; the Google Fonts download needs internet, so it was checked with fonts stubbed).
**Not run here:** Playwright (no browser), anything against a real Neon database, the Google Fonts download. Run `npm run build` once on your machine and the smoke checklists in `docs/AUTH.md` and below on the preview URL.

## Smoke checklist for 2C and 3A (preview, then production)
- Run `khushio-sql-phase-2c.sql` then `khushio-sql-phase-3a.sql` on the branch first; read the status row at the bottom of each.
- Sign out and in again (new permission use needs no new keys, but sessions are 8 hours).
- Wrong password five times with one email, the sixth attempt (even with the right password) shows the throttle message; after 15 minutes it works again.
- /admin/categories: create Fashion, then Shoes under it, then Running under Shoes; a duplicate name under the same parent is refused; archive Running, restore it.
- /admin/brands: create, archive, restore, delete a brand.
- /admin/merchants: create "Amazon India" with `amazon.in` and `amzn.to`; `co.in` is refused; check /admin/audit shows the creates and the domain list.

## Carry-over items (not done yet)
1. Branch protection on `main` requiring the two CI checks (needs the first green CI run).
2. Cost numbers for 2A to 3A in `docs/PERFORMANCE.md`.
3. Add the `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `E2E_ADMIN_PASSWORD` secrets, run `phase-2c` and `phase-3a` on the Neon `test` branch.

## Next three tasks
1. Run the checks and smoke tests above, tag `phase-2c` and `phase-3a`.
2. Release 3B: products, variants, Cloudinary uploads, with `khushio-sql-phase-3b.sql`.
3. Release 3C: public catalogue pages and search.
