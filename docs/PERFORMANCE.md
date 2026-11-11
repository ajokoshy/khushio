# Performance and cost log

Fill in at the end of every release (guide section 7.4). If any figure is above 50 percent of its free allowance before launch, fix that first.

| Release | Date | Vercel usage | Neon usage (compute / storage) | Cloudinary usage | Notes |
| --- | --- | --- | --- | --- | --- |
| 2A | | | | | |
| 2B | | | | | Dashboard counts are cached 60 s: expect about 3 small queries per minute while an admin is on the page |

Targets from 7B: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less.
