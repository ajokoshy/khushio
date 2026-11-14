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

/* ---------------------- sample products (Release 3C) ---------------------- */

export type SeedProduct = {
  slug: string;
  name: string;
  summary: string;
  description: string;
  categorySlug: string;
  brandSlug: string;
  /** DRAFT products are included on purpose: they must never appear on the public site. */
  status: "PUBLISHED" | "DRAFT";
  tags: string[];
  variants: { label: string; sku: string; priceMinor: number }[];
};

const FAMILIES: { category: string; nouns: string[]; adjectives: string[]; base: number }[] = [
  { category: "men-shoes", nouns: ["Running Shoes", "Trail Sneakers", "Leather Loafers", "Canvas Sneakers"], adjectives: ["Aero", "Stride", "Urban", "Summit"], base: 249900 },
  { category: "women-handbags", nouns: ["Tote Bag", "Sling Bag", "Backpack", "Clutch"], adjectives: ["Maple", "Willow", "Saffron", "Indigo"], base: 149900 },
  { category: "air-fryers", nouns: ["Air Fryer 4L", "Air Fryer 6L", "Digital Air Fryer"], adjectives: ["Crisp", "Zest", "Nova"], base: 599900 },
  { category: "headphones", nouns: ["Wireless Headphones", "Noise Cancelling Headphones", "Earbuds"], adjectives: ["Pulse", "Echo", "Orbit"], base: 199900 },
  { category: "cookware", nouns: ["Non-stick Pan", "Cast Iron Skillet", "Pressure Cooker"], adjectives: ["Hearth", "Ember", "Copper"], base: 129900 },
];

/** 60 deterministic sample products so search, filters and cursor pages can be tried. Every tenth one is a draft. */
export function generateSeedProducts(count = 60): SeedProduct[] {
  const out: SeedProduct[] = [];
  let n = 0;
  while (out.length < count) {
    for (const family of FAMILIES) {
      for (const noun of family.nouns) {
        const adjective = family.adjectives[n % family.adjectives.length] as string;
        const name = `${adjective} ${noun}`;
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${out.length + 1}`;
        const price = family.base + (n % 7) * 20000;
        out.push({
          slug,
          name,
          summary: `${name}: a dependable pick for everyday use.`,
          description: `The ${name} is a sample product for testing the Khushio catalogue.\n\nIt exists only in development databases.`,
          categorySlug: family.category,
          brandSlug: n % 2 === 0 ? "example-brand-one" : "example-brand-two",
          status: (out.length + 1) % 10 === 0 ? "DRAFT" : "PUBLISHED",
          tags: [family.category.split("-").pop() as string, n % 3 === 0 ? "bestseller" : "new"],
          variants: [
            { label: "Standard", sku: `SEED-${out.length + 1}-A`, priceMinor: price },
            ...(n % 2 === 0 ? [{ label: "Large", sku: `SEED-${out.length + 1}-B`, priceMinor: price + 50000 }] : []),
          ],
        });
        n++;
        if (out.length >= count) return out;
      }
    }
  }
  return out;
}
