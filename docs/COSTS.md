# Keeping Khushio cheap to run

Khushio is built so that a small site fits comfortably in free or entry plans of **Vercel**, **Neon** and **Cloudinary**.
**Admin → Costs** shows live usage against your limits. This page lists what is built in, and the rules that keep it that way.

## What is built in

### Vercel (hosting and functions)
| Measure | Effect |
|---|---|
| Pages are built once and served from the cache (static / ISR) | Most visits never run a function |
| Edits refresh only what they touch (cache tags: products, journal, deals, settings, nav, pages, home…) | No blanket "rebuild everything" after each edit |
| Refresh windows by need: 6 hours (products, brands, categories, comparisons), 30 minutes (home, deals, coupons, journal: they can expire or go live by date) | Bounded regeneration; a quiet page costs nothing |
| `/shop`, `/journal`, `/gifts`, `/compare` depend on the query string, so they render per request, but carry a 5-minute shared-cache header | The CDN answers repeat visits to the same URL without a function |
| Plain `<img>`, `images.unoptimized: true` | Vercel Image Optimization is never billed: Cloudinary already optimises |
| No middleware, no edge functions, no analytics scripts, no dynamic Open Graph image generation | No per-request edge cost |
| Click logging runs *after* the redirect (`after()`), and housekeeping rides along on 1 in 500 clicks | Fast redirects; no cron job needed |
| Fonts are self-hosted by Next; logo and hero served from `/public` with day-long caching | No third-party font requests |
| Mobile menu is a native `<details>`; sections are server components | Very little JavaScript shipped (about 105 kB shared) |

### Cloudinary (images)
| Measure | Effect |
|---|---|
| Delivered in only **four widths** (320, 640, 960, 1280) with one recipe `f_auto,q_auto,c_limit` | Each picture can create at most 4 derived files, however many pages use it. Old stored URLs are rewritten onto the same recipe |
| Uploads: JPG/PNG/WebP, max 3 MB, stored at 1600 px maximum with automatic quality | Smaller stored originals |
| Hash check before upload, and a hash-derived public id with `overwrite=false` | The same picture is never stored twice, even if a database row is lost |
| No eager transformations; thumbnails reuse the delivery widths | Derived files are created only when someone views them |
| Media library cap (`MEDIA_MAX_ITEMS`, default 500), "Unused" filter, and delete-from-Cloudinary for unused images | Storage can be reclaimed from the admin |
| Provider boundary (`lib/media/provider.ts`) | A different image host can be added without touching screens |

### Neon (database)
| Measure | Effect |
|---|---|
| Only values that differ from defaults are stored (settings, homepage section options) | Rows stay tiny |
| Built-in pages, menus and homepage layout live in code until someone customises them | Zero rows until needed |
| Media rows hold a reference, not a file | Kilobytes, not megabytes |
| Article history keeps the last 5 versions | History cannot grow |
| Clicks older than 30 days become one row per offer per day; audit entries older than 180 days, login records older than 1 day and import uploads older than 1 day are deleted | Storage stays flat |
| Search, listings and counts are cached; pages read cached data | Fewer queries, so less compute time |
| Newsletter sign-ups go straight to your email provider | No personal data stored here |

## Rules for future changes (please keep)
1. **Never lower the default data-cache lifetime** in `lib/cache.ts`, and don't give a loader a lifetime shorter than the page needs. Next.js lets the *shortest* lifetime on a page override the page's own `revalidate`. A 5-minute default once made every page regenerate every 5 minutes.
2. Don't use `next/image`; use `components/Img.tsx`. Don't add image widths or transformation options: every new combination is a new billable derived file.
3. Avoid reading `searchParams` or cookies on public pages unless truly needed (it makes the page per-request). If you must, add its path to the shared-cache list in `next.config.mjs`.
4. No middleware.
5. New content tables should store references and bounded text, and get a retention rule in `lib/maintenance.ts` if they grow with traffic.

## Knobs (environment variables)
`MEDIA_MAX_ITEMS`, `DB_SOFT_LIMIT_MB`, `CRON_SECRET` (enables `GET /api/maintenance` for an optional daily Vercel cron), `MEDIA_PROVIDER`. See `.env.example`.
