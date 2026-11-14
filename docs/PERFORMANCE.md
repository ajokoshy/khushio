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

Targets from 7B: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less.
