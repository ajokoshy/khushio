export const SORTS = ["new", "name", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

/** Filters read from the address bar. Prices are in minor units of the site currency. */
export type CatalogFilters = {
  q?: string;
  /** Brand slug. */
  brand?: string;
  /** Category slug (only on pages that offer a category filter). */
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: Sort;
  cursor?: string;
};

export type CatalogCard = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  brandName: string | null;
  brandSlug: string | null;
  imagePublicId: string | null;
  imageAlt: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
};

export type CatalogPage = {
  cards: CatalogCard[];
  nextCursor: string | null;
  /** The search found nothing exact, so these are close matches (typo tolerance). */
  fuzzy: boolean;
};

export type ProductDetailPublic = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  brand: { name: string; slug: string } | null;
  primaryCategoryId: string | null;
  variants: { id: string; label: string; sku: string | null; priceMinor: number | null; currency: string }[];
  images: { publicId: string; alt: string }[];
  attributes: { name: string; value: string }[];
  tags: string[];
  /** Active affiliate links to active merchants. The /go redirect arrives in Release 4A. */
  links: { slug: string; merchantName: string }[];
};
