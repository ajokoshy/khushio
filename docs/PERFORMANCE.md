# Performance and cost log

Fill in at the end of every release (guide section 7.4). If any figure is above 50 percent of its free allowance before launch, fix that first.

| Release | Date | Vercel usage | Neon usage (compute / storage) | Cloudinary usage | Notes |
| --- | --- | --- | --- | --- | --- |
| 2A | | | | | |
| 2B | | | | | Dashboard counts are cached 60 s: expect about 3 small queries per minute while an admin is on the page |
| 2C | | | | | Login: one small indexed read per attempt (two from the form), one insert per failure, nothing for visitors |
| 3A | | | | | Admin reads of categories are cached 24 h (tag `categories`); lists of brands and merchants are paged (limit + 1 rows, no count queries) |
| 3B | | | | | Admin only. One Cloudinary upload per image (browser to Cloudinary, no Vercel bandwidth); one extra small read per save for SKU and category checks. Duplicate files are removed from Cloudinary again |
| 3C | | | | | Visitor pages: category, brand, store, collection and product reads cached 30 min (tag `products`); searches are uncached (2 indexed queries at most). Images use four Cloudinary profiles with srcset, lazy loading except the first two cards and the main product picture |
| 4A | | | | | /go: one indexed read plus one insert (after the response); no caching possible or wanted. Each click adds one row (about 100 bytes). Admin link screens are paged |
| 4B | | | | | Nightly job: one read, one upsert over at most about 8 days of clicks, one delete; one invocation per day. Reports read only `affiliate_click_daily` (one row per link per day). Watch raw-click storage in Neon after the first busy week; shorten retention to 14 days if needed |

| 5A | | | | | Admin only. CSV preview reads at most 2 MB; no visitor impact |
| 5B | | | | | Import runs in batches inside one request (limit 3 MB body); Neon compute is the thing to watch during a 500-row import |
| 6A | | | | | Articles: reader pages cached 5 min (tag `articles`); one insert per autosave-free save; cover pictures use the same four Cloudinary profiles |
| 6B | | | | | Homepage and navigation cached (tags `homepage`, `navigation`); product embeds are one batched read per article page |
| 7A | | | | | Redirect map: one Neon read an hour (data cache, cleared on every redirect change); middleware does an in-memory lookup per page request, no query. SEO overrides cached 30 min (tag `seo`). Sitemap cached an hour |
| 7B | | | | | Analytics and Speed Insights run on Vercel's side and write nothing to Neon. `/go` recording is rate-limited per visitor. Error and CSP reports are log lines only |

Targets from 7B: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less.

## Release 7B performance review
**Measured in the build (`next build`, Release 7B code, stand-in fonts):**
| Item | Result |
| --- | --- |
| JavaScript shared by every page | 103 kB (gzip, as Next.js reports it) |
| First load JS, home page | 112 kB |
| First load JS, product, category, brand, article and other public pages | 106 to 107 kB |
| Middleware | 89 kB (public pages: one in-memory redirect lookup) |
| Admin article editor (for comparison) | 222 kB, loaded only inside `/admin` |
| Admin-only code in any public page | none: `npm run check:bundles` reads the files each public page loads and fails on editor, form-library or import code. It found the editor code in admin chunks only, so the check is meaningful |
| Public-page JavaScript budget | 450 kB uncompressed per page (the largest today is 366 kB) |

**Review against the Core Web Vitals targets (by reading the code, because Lighthouse needs a deployed site):**
- *LCP:* the largest element is the homepage banner or the first product image. Both are loaded eagerly with `fetchpriority="high"`, only one per page, with explicit width and height; every other image is lazy. New in 7B: the browser opens the connection to Cloudinary early (`preconnect`). Pictures arrive resized and converted (`f_auto,q_auto`) at four fixed widths with `srcset`.
- *CLS:* every picture has width and height (or an aspect ratio for the placeholder); fonts use `display: swap` with next/font (no layout jump from a late font file); no content is inserted above existing content after load. Analytics scripts load after interactivity and add no visible element.
- *INP:* public pages ship about 106 kB of JavaScript and no heavy client component (the editor, forms library and import wizard are admin-only). The only interactive public pieces are links, the search form and the filters.
- *Worst three pages:* the home page (largest image), the product page (gallery plus several images) and the discover page (a list with filters) are the ones to measure first. Nothing in the review needed changing beyond the preconnect above, so there was no fix to make without measurements. **Measure them for real**: run the "Lighthouse budget" GitHub workflow on the preview address (median of 3), then read Vercel Speed Insights after a week of real visits, and fix what the numbers show.
- Public pages are cached (ISR or the data cache), so a visit usually costs no database query.

**Budgets in CI:** `lighthouserc.json` fails the Lighthouse workflow if LCP is over 2.5 s, CLS over 0.1, total blocking time over 200 ms (the lab stand-in for INP), accessibility or SEO scores under 0.95, or a page is missing a title, description or image alt text. Run it by hand after each deploy (it needs a live address).

**How to measure bundles:** `npm run analyze` writes interactive reports to `.next/analyze/client.html` (what each page ships). `npm run build && npm run check:bundles` is the automatic version used in CI.

## Final monthly cost estimate (to complete with real numbers)
The estimate needs one week of real traffic. Fill the "Measured" column from the three dashboards and multiply the weekly figure by 4.3. Allowances change, so read the current numbers on each pricing page rather than trusting this table.

| Service | What to read | Measured (one week) | Projected month | Allowance (check pricing page) |
| --- | --- | --- | --- | --- |
| Vercel | Usage: function invocations, fast data transfer, edge requests, ISR reads and writes | | | |
| Vercel | Speed Insights and Web Analytics events | | | |
| Neon | Usage: compute hours, storage, data transfer | | | |
| Cloudinary | Usage: credits (transformations, storage, bandwidth) | | | |
| Domain | Yearly price divided by 12 | | | |
| **Total per month** | | | | |

**Things that change the answer:** Vercel's free (Hobby) plan is for personal, non-commercial use, and an affiliate site earns commission, so read Vercel's current terms and plan for the paid plan when you launch commercially. Neon's free compute hours run out if something keeps the database awake all day: the only things that touch it regularly are the redirect map (once an hour), the daily click roll-up and admin work. Cloudinary credits are consumed mostly by image bandwidth; keep the four fixed profiles.
