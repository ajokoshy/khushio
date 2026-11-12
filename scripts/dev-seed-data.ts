/** Starter data for DEVELOPMENT databases only (see scripts/seed-dev.ts). Pure data: no database access. */
export type SeedCategory = { name: string; slug: string; children?: SeedCategory[] };

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "Fashion", slug: "fashion",
    children: [
      { name: "Men", slug: "men", children: [{ name: "Shoes", slug: "men-shoes" }, { name: "Watches", slug: "men-watches" }] },
      { name: "Women", slug: "women", children: [{ name: "Footwear", slug: "women-footwear" }, { name: "Handbags", slug: "women-handbags" }] },
    ],
  },
  {
    name: "Home & Kitchen", slug: "home-and-kitchen",
    children: [
      { name: "Appliances", slug: "appliances", children: [{ name: "Air fryers", slug: "air-fryers" }, { name: "Mixer grinders", slug: "mixer-grinders" }] },
      { name: "Cookware", slug: "cookware" },
    ],
  },
  {
    name: "Electronics", slug: "electronics",
    children: [{ name: "Mobiles", slug: "mobiles" }, { name: "Headphones", slug: "headphones" }],
  },
];

export const SEED_BRANDS = [
  { name: "Example Brand One", slug: "example-brand-one" },
  { name: "Example Brand Two", slug: "example-brand-two" },
];

export const SEED_MERCHANTS = [
  { name: "Amazon India", slug: "amazon-india", websiteUrl: "https://www.amazon.in", allowedDomains: ["amazon.in", "amzn.to"] },
  { name: "Flipkart", slug: "flipkart", websiteUrl: "https://www.flipkart.com", allowedDomains: ["flipkart.com", "fkrt.it"] },
];
