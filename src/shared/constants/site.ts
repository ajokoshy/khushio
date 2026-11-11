export const SITE = {
  name: "Khushio",
  tagline: "Discover More. Save More. Live Happier.",
  description:
    "Find the best products, deals and brands in one place. Khushio helps you discover, compare and shop.",
} as const;

/** Placeholder categories for the Phase 1 shell only. Real categories live in the database. */
export const NAV = [
  { label: "Discover", href: "/discover" },
  { label: "Deals", href: "/deals" },
  { label: "Compare", href: "/compare" },
  { label: "Guides", href: "/guides" },
] as const;
