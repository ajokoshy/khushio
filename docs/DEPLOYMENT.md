# Deployment

Mirrors sections 6 and 7 of the Khushio Project Guide. Each release's own section lists only what is specific to it.

Database changes are **plain SQL files, safe to re-run, pasted into the Neon SQL Editor** (no `drizzle-kit migrate`). See `drizzle/migrations/README.md`.

## One-time setup

### GitHub
- Create a private repository named `khushio`.
- Unzip the project, run `npm install`, commit the generated `package-lock.json`.
- Confirm `.gitignore` excludes `.env`, `.env.local`, `node_modules` and `.next`.
- `git init`, `git add .`, `git commit -m "Phase 1 foundation"`, add the remote, push to `main`.
- Protect `main`: require pull requests and require these checks to pass: **Typecheck, lint, unit tests, build** and **Playwright smoke** (they exist from Release 2B).
- Workflow from now on: one branch per phase, open a pull request, review the Vercel preview, merge to `main`.

### Neon
- Create a project named `khushio` in the region nearest your Vercel functions region (Mumbai for India users where available, otherwise Singapore).
- The default branch is production. Create a second branch called `preview`, and a third called `test` for CI (see below).
- For each branch copy the **pooled** string (host contains `-pooler`) from the Connect dialog. Keep it in a password manager. Never commit it.

| Variable | Value | Used by |
| --- | --- | --- |
| DATABASE_URL | pooled string | the running app, including the admin login lookup |
| DATABASE_URL_UNPOOLED | direct string (optional) | `npm run db:studio` only |

### Cloudinary
- Create a free account and note the cloud name. Create an API key and secret (Settings, Access Keys).
- Folder convention: `khushio/products`, `khushio/editorial`, `khushio/brands`.
- Do not enable features you do not need (no video, no AI add-ons).
- Variables: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (the secret is server-only).

### Vercel
- Import the GitHub repository. Framework preset: Next.js. Leave the build command as `next build`. Do not run database scripts from the build.
- Settings, Environment Variables:
  - Production: production Neon strings, production Cloudinary values, `NEXT_PUBLIC_SITE_URL` set to your real domain, `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_TRUST_HOST=true`.
  - Preview: the preview Neon branch strings, the same Cloudinary values, a different `AUTH_SECRET`, `AUTH_TRUST_HOST=true`.
- Production branch: `main`.
- Settings, Domains: add your domain and follow the DNS instructions.
- Settings, Billing: set a spend limit and usage alerts.
- Function region: match your Neon region.

### GitHub Actions secrets (Release 2B)
Settings, Secrets and variables, Actions. All optional: without them CI still runs the checks and the database-free browser tests.

| Secret | Value |
| --- | --- |
| TEST_DATABASE_URL | pooled string of the Neon `test` branch (integration tests) |
| E2E_DATABASE_URL | pooled string of the same `test` branch (browser tests) |
| E2E_ADMIN_PASSWORD | the password of the CI admin `e2e-admin@example.test` |

Create the `test` branch from production, run `khushio-sql-firstload.sql` and every `khushio-sql-phase-*.sql` on it (today `phase-2c` and `phase-3a`), then run `set-admin.sql` there with `e2e-admin@example.test` and the password you saved as `E2E_ADMIN_PASSWORD`. Never point these secrets at production.

### First deployment check (Phase 1 sign-off)
- Create `.env.local` from `.env.example` using the **preview** Neon branch.
- In the Neon SQL Editor on the preview branch run `khushio-sql-firstload.sql` (its last query should show 29 tables), then `set-admin.sql` with your email and password.
- `npm run build` locally (this also confirms the Google Fonts download works).
- Push a branch, open a pull request, open the Vercel preview URL.
- `/api/health` returns `{"status":"ok"}`, the homepage shows the banner, `/robots.txt` and `/sitemap.xml` load.
- Merge to `main`. Before the production deploy finishes, run `khushio-sql-firstload.sql` and `set-admin.sql` on the **production** Neon branch (after creating a `backup-` branch).
- Check the production URL the same way, and sign in at `/admin-login` with the admin you created.

## Standard procedure (every release)

### Code
- Work on branch `phase-<id>-<n>`.
- Locally: `npm run typecheck && npm run lint && npm test && npm run build`.
- Push and open a pull request. CI runs and Vercel builds a preview.
- Test the preview URL against the release's smoke checklist.
- Merge to `main`. Vercel deploys production. Run the smoke checklist on production.
- Update `docs/IMPLEMENTATION_STATUS.md` and tag: `git tag phase-<id> && git push --tags`.

### Database
- Change the Drizzle schema, and write the release's `drizzle/migrations/khushio-sql-phase-<release>.sql` (additive, re-runnable, ends with a status query; template and rules in `drizzle/migrations/README.md`). Every release gets a file, even one with no schema change.
- `npm test` applies all SQL files to an embedded Postgres twice and fails if they disagree with the Drizzle schema.
- **Read the SQL.** Look for DROP, column type changes and NOT NULL additions on existing tables. If present, split into an expand step now and a contract step in a later release.
- Neon SQL Editor, **preview** branch: paste and run the release file. Test the preview deployment.
- Before production, create a Neon branch from production named `backup-<phase>-<date>`.
- Neon SQL Editor, **production** branch: paste and run the same file.
- Merge the pull request so the new code deploys after the schema is ready.
- Delete old backup branches after a week.

**Rule:** the database always moves first, and the SQL must work with both the old and the new code (expand, then contract).

### Rollback
- **Code:** in Vercel, Deployments, promote the previous deployment (instant).
- **Database:** the SQL files are additive, so old code keeps working. If a script itself went wrong, restore from the `backup-<phase>-<date>` branch using Neon's restore or by swapping connection strings.

### Per-release cost check
Open Vercel Usage, Neon Usage and Cloudinary Usage and write the three numbers into `docs/PERFORMANCE.md`. If any is above 50 percent of its free allowance before launch, fix that first.
