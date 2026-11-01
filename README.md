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
| `MEDIA_MAX_ITEMS`, `DB_SOFT_LIMIT_MB`, `MEDIA_PROVIDER`, `CRON_SECRET` | Optional cost guards; see `docs/COSTS.md` |

After signing in, **/admin/status** shows what is configured and whether the latest migration is applied (it never shows secret values).
Changing the admin password hash, email or `AUTH_SECRET` signs every admin session out.

## Database
See `db/README.md`. In short: run new files from `db/migrations/` in the Neon SQL Editor in order. **Apply 008 and 009 before deploying this version.**

## How affiliate links are protected
- Pages link to `/go/<offer id>`. The destination is read from the database, never from the URL, so it cannot be used as an open redirect.
- A link is only followed if the offer is active and not expired, its product is published, and its merchant is active.
- Destinations must be `https`, carry no credentials, and match the merchant's **approved link domains** when set (Admin → Merchants). The same check runs when a link is saved and again on every click.
- Clicks are logged after the redirect, skipping bots and link previewers; a logging failure never blocks the visitor. Referrers are stored as a path or host only.

## Prices, search and caching
- **Prices live on each retailer offer** (price, MRP, "price checked" date). A product page lists retailers cheapest first; the headline price is the cheapest *live* offer price, and shows "approx." when only the product's reference price exists. Imported prices are stored unverified until someone ticks "price checked". Product structured data includes a price only if it was verified in the last 14 days.
- **Search** is PostgreSQL full-text search (name, brand, category, description) with word-prefix matching, filters (category incl. sub-categories, brand, retailer, price range), sorting and pagination. Search, price-range and sort variants are `noindex` and canonicalise to the plain listing.
- **Caching:** every data loader is cached in Next's data cache under a tag (`products`, `categories`, `brands`, `deals`, `coupons`, `articles`, `collections`, `settings`, `redirects`). Admin changes invalidate only the tags they affect. Product, category, brand, store and collection pages are statically generated; `/shop`, `/gifts` and `/compare` render on demand but read cached data.
- **Redirects:** changing a product or collection slug adds a 301 automatically; Admin → Redirects manages the rest. They are applied only when a page is not found, so working pages are never slowed down.
- **Admin:** Affiliate links (every retailer link with status, last check, clicks, domain check), Preview (drafts as visitors would see them), duplicate warnings when creating products, archive instead of delete.
- **CSV import/export** covers products, retailer offers/prices, merchants, brands, categories and articles; export every table in the same format to edit and re-import. Imports are previewed first and written in atomic chunks of 100 rows (max 500 per file).

## Content, homepage and media (Phase 2)
Everything below is edited in the admin, with no code changes:
- **Homepage** (Admin → Homepage): 16 section types (hero, categories, featured, new arrivals, hand-picked, deals, coupons, best picks, brands, collections, journal, gift finder, trust points, newsletter, banner, stores), reorderable, with optional start/end times. Until you customise it, a built-in layout is used and nothing is stored.
- **Site settings, navigation, pages** (Settings, Navigation, Pages): typed, validated settings (only changed values are stored); header and footer menus; legal and information pages with built-in default text, plus your own pages.
- **Journal** (Articles): Markdown with a safe renderer, drafts, scheduling (India time), categories, tags, author, cover image, SEO fields, the last 5 versions with restore, product cards (`[[product:slug]]`) and images (`![alt](media:ID)`) inside articles, related reading, and "From the journal" on product pages.
- **Media library** (Media): upload with required alt text, duplicate protection, usage counts, delete unused images from Cloudinary.
- **More pages**: `/deals/<deal>`, `/gifts/<occasion>` (saved searches, Admin → Occasions), `/compare/<comparison>` (curated, Admin → Comparisons), `/brands`, `/journal/<category>`.
- **Costs** (Admin → Costs): database and image usage against your limits, one-click clean-up. See `docs/COSTS.md`.

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
