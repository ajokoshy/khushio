import { CURRENCY_EXPONENT, type CurrencyCode } from "@/core/validation/money";
import { env } from "@/core/config/env";
import { SITE } from "@/shared/constants/site";
import { absoluteUrl } from "./metadata";

/**
 * Release 7A: structured data (JSON-LD) builders. Plain functions that return plain objects, so they can be tested by
 * parsing the output. The rules that keep Google (and visitors) from being misled:
 *   - Product: an Offer is written ONLY for a variant that has both a price and a known availability. Khushio does not
 *     track stock yet, so today no page passes an availability and no Offer is emitted; the Product itself still is.
 *   - Article, BreadcrumbList, Organization and WebSite only say what the page itself shows.
 *   - Nothing is emitted for a page a visitor cannot see (callers only build it after the page was found).
 * Offers from the deals module are not turned into structured data: schema.org has no valid coupon type, and an Offer
 * needs a price a coupon does not have. (The live-only rule in modules/deals/window.ts still decides what the page lists.)
 */

export type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";

/** 19900 INR minor units -> "199.00". Zero-decimal currencies (JPY) give "199". */
export function minorToDecimalString(minor: number, currency: string): string {
  const exponent = (CURRENCY_EXPONENT as Record<string, number>)[currency] ?? 2;
  return exponent === 0 ? String(minor) : (minor / 10 ** exponent).toFixed(exponent);
}

export const AVAILABILITY = {
  InStock: "https://schema.org/InStock",
  OutOfStock: "https://schema.org/OutOfStock",
  PreOrder: "https://schema.org/PreOrder",
  LimitedAvailability: "https://schema.org/LimitedAvailability",
} as const;
export type Availability = keyof typeof AVAILABILITY;

export function organizationJsonLd(): JsonLd {
  return { "@context": CONTEXT, "@type": "Organization", name: SITE.name, url: env.NEXT_PUBLIC_SITE_URL, logo: absoluteUrl("/brand/logo.png"), description: SITE.description };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: SITE.name,
    url: env.NEXT_PUBLIC_SITE_URL,
    description: SITE.description,
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/discover")}?q={search_term_string}` }, "query-input": "required name=search_term_string" },
  };
}

export type Crumb = { label: string; href?: string };

/** A trail needs at least two steps to mean anything. Steps with a link carry their address; the last step (this page) needs none. */
export function breadcrumbJsonLd(items: readonly Crumb[]): JsonLd | null {
  if (items.length < 2) return null;
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.label, ...(item.href ? { item: absoluteUrl(item.href) } : {}) })),
  };
}

export type ProductVariantInput = { label: string; sku: string | null; priceMinor: number | null; currency: string; availability?: Availability | null };

export type ProductJsonLdInput = {
  name: string;
  path: string;
  description?: string | null;
  images: readonly string[];
  brand?: string | null;
  variants: readonly ProductVariantInput[];
};

/** Offers for the variants whose price AND availability are both known. Empty when there are none. */
export function offersFor(path: string, variants: readonly ProductVariantInput[]): JsonLd[] {
  const out: JsonLd[] = [];
  for (const v of variants) {
    if (v.priceMinor === null || !Number.isInteger(v.priceMinor) || v.priceMinor < 0) continue;
    if (!v.availability || !(v.availability in AVAILABILITY)) continue;
    out.push({ "@type": "Offer", url: absoluteUrl(path), price: minorToDecimalString(v.priceMinor, v.currency), priceCurrency: v.currency, availability: AVAILABILITY[v.availability], ...(v.sku ? { sku: v.sku } : {}) });
  }
  return out;
}

export function productJsonLd(input: ProductJsonLdInput): JsonLd {
  const offers = offersFor(input.path, input.variants);
  const skus = input.variants.map((v) => v.sku).filter((s): s is string => !!s);
  return {
    "@context": CONTEXT,
    "@type": "Product",
    name: input.name,
    url: absoluteUrl(input.path),
    ...(input.description ? { description: input.description } : {}),
    ...(input.images.length > 0 ? { image: [...input.images] } : {}),
    ...(input.brand ? { brand: { "@type": "Brand", name: input.brand } } : {}),
    ...(skus.length === 1 ? { sku: skus[0] } : {}),
    ...(offers.length === 1 ? { offers: offers[0] } : offers.length > 1 ? { offers } : {}),
  };
}

export type ArticleJsonLdInput = {
  headline: string;
  path: string;
  description?: string | null;
  image?: string | null;
  datePublished?: Date | null;
  dateModified?: Date | null;
  authorName?: string | null;
};

export function articleJsonLd(input: ArticleJsonLdInput): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Article",
    headline: input.headline.slice(0, 110),
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(input.path) },
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: [input.image] } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished.toISOString() } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified.toISOString() } : {}),
    author: input.authorName ? { "@type": "Person", name: input.authorName } : { "@type": "Organization", name: SITE.name, url: env.NEXT_PUBLIC_SITE_URL },
    publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: absoluteUrl("/brand/logo.png") } },
  };
}

/**
 * JSON for a <script type="application/ld+json"> block. "<", ">" and "&" are written as \u escapes so that text inside the
 * data (a product name, an article title) can never close the script tag or start a comment: no script injection.
 */
export function serializeJsonLd(data: JsonLd | readonly JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** What each type must carry (used by the tests, which parse the serialised output). */
export const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  Organization: ["name", "url"],
  WebSite: ["name", "url"],
  BreadcrumbList: ["itemListElement"],
  Product: ["name"],
  Offer: ["price", "priceCurrency", "availability"],
  Article: ["headline", "author", "publisher", "datePublished"],
};

export const hasCurrency = (value: string): value is CurrencyCode => value in CURRENCY_EXPONENT;
