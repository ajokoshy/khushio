/** Revalidation windows in seconds. Configurable in one place (brief §14). */
export const CACHE_TTL = {
  categories: 60 * 60 * 24,
  brands: 60 * 60 * 24,
  merchants: 60 * 60 * 24,
  products: 60 * 30,
  homepage: 60 * 10,
  /** Also the /deals page's revalidate (src/app/(public)/deals/page.tsx). Keep it below START_LOOKAHEAD_MS in modules/deals/window.ts. */
  deals: 60 * 5,
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
  articles: "articles",
  settings: "settings",
  dashboard: "dashboard",
} as const;
