import { cld } from "@/lib/cloudinary";
import { site } from "@/lib/config/site";

/** A retailer price only counts as "verified" for structured data if someone checked it this recently. */
export const VERIFIED_PRICE_DAYS = 14;
type LdOffer = { merchant: string; price?: number; currency?: string; checkedAt?: string };
type LdProduct = { slug: string; name: string; blurb: string; image?: string; offers: LdOffer[] };

/** Product structured data. Offer/price markup is included only for prices verified within VERIFIED_PRICE_DAYS. */
export function productJsonLd(p: LdProduct, brandName?: string, now = new Date()) {
  const fresh = p.offers.filter((o) => o.price && o.price > 0 && o.checkedAt && now.getTime() - new Date(o.checkedAt).getTime() <= VERIFIED_PRICE_DAYS * 86_400_000);
  return {
    "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.blurb, url: `${site.url}/products/${p.slug}`,
    image: p.image ? cld(p.image, 1200) : undefined, brand: brandName ? { "@type": "Brand", name: brandName } : undefined,
    offers: fresh.length ? fresh.map((o) => ({ "@type": "Offer", price: o.price, priceCurrency: o.currency ?? "INR", seller: { "@type": "Organization", name: o.merchant } })) : undefined,
  };
}
