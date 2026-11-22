/** Revalidation windows in seconds. Configurable in one place (brief §14). */
export const CACHE_TTL = {
  categories: 60 * 60 * 24,
  brands: 60 * 60 * 24,
  merchants: 60 * 60 * 24,
  products: 60 * 30,
  homepage: 60 * 10,
  /** Release 6B: the header and footer links. Every navigation write clears the tag `navigation` at once. */
  navigation: 60 * 10,
  /** Articles and pages: short, because scheduled articles go live by the clock, not by a job (modules/content/public.ts). */
  articles: 60 * 5,
  /** Also the /deals page's revalidate (src/app/(public)/deals/page.tsx). Keep it below START_LOOKAHEAD_MS in modules/deals/window.ts. */
  deals: 60 * 5,
  /** Release 7A: the redirect map. Long on purpose: every redirect write (and every slug change) clears the tag `redirects` at once. */
  redirects: 60 * 60,
  /** Release 7A: per-page search overrides for products, categories, brands and stores. Every SEO write clears the tag `seo`. */
  seo: 60 * 30,
  siteSettings: 60 * 30,
  dashboard: 60,
} as const;

export const CACHE_TAGS = {
  products: "products",
  categories: "categories",
  brands: "brands",
  merchants: "merchants",
  deals: "deals",
  homepage: "homepage",
  navigation: "navigation",
  articles: "articles",
  redirects: "redirects",
  seo: "seo",
  settings: "settings",
  dashboard: "dashboard",
} as const;
