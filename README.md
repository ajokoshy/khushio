# Khushio

Affiliate product-discovery site (Next.js 15 App Router, TypeScript, Tailwind, Neon Postgres + Drizzle, Cloudinary, Vercel).
Khushio does not sell anything or take payments: every "Buy" button is an affiliate link through `/go/[id]`.

## Run locally
```bash
npm install
cp .env.example .env.local     # fill in the values below
npm run dev
```
Without `DATABASE_URL` the site shows built-in **sample data in development only**. In production it shows an empty catalogue instead, never samples.

## Environment variables
| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `AUTH_SECRET` | 32+ random characters; signs admin sessions |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | Admin login. Generate the hash with `npm run hash`. A plain `ADMIN_PASSWORD` works in development only |
| `NEXT_PUBLIC_SITE_URL` | `https://…` public URL, used for canonicals and the sitemap |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image uploads (optional) |
| `AFFILIATE_STRICT_DOMAINS=1` | Optional. Rejects links for any merchant with no approved domains |

After signing in, **/admin/status** shows what is configured and whether the latest migration is applied (it never shows secret values).
Changing the admin password hash, email or `AUTH_SECRET` signs every admin session out.

## Database
See `db/README.md`. In short: run new files from `db/migrations/` in the Neon SQL Editor in order. **Apply 008 before deploying this version.**

## How affiliate links are protected
- Pages link to `/go/<offer id>`. The destination is read from the database, never from the URL, so it cannot be used as an open redirect.
- A link is only followed if the offer is active and not expired, its product is published, and its merchant is active.
- Destinations must be `https`, carry no credentials, and match the merchant's **approved link domains** when set (Admin → Merchants). The same check runs when a link is saved and again on every click.
- Clicks are logged after the redirect, skipping bots and link previewers; a logging failure never blocks the visitor. Referrers are stored as a path or host only.

## Tests
```bash
npm test                      # unit + route tests (no database needed)
TEST_DATABASE_URL=postgres://user:pw@localhost:5432/khushio_test npm test   # also runs the database tests
```
The database tests **drop and rebuild the schema** of the database you point them at; the name must end in `_test`.
They apply every migration, check `schema.sql` matches the migrations, and exercise the live-offer rules, admin actions and CSV import.

## Backups and recovery
Neon keeps point-in-time history on every plan (window depends on plan). Before risky changes create a Neon branch, or run
`pg_dump "$DATABASE_URL" -Fc -f khushio-$(date +%F).dump` and keep the file somewhere other than Vercel. Restore with `pg_restore`
into a new Neon branch first, check it, then switch `DATABASE_URL`. Products are archived, not deleted, so most mistakes can be undone from the admin.

## Cost notes
Pages are statically generated and revalidated (60 s), so most visits do not touch the database. Keep it that way: avoid reading
`searchParams` or cookies in public pages, and keep images on Cloudinary with `f_auto,q_auto` (already applied).

See `docs/STATUS.md` for what is implemented and what is still pending against the requirements brief.
