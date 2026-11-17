import { unstable_cache } from "next/cache";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import * as repo from "./repository";
import type { DealsPage, PublicDeal } from "./types";
import { liveDeals, onlyLive } from "./window";

export { liveDeals };

/**
 * Public reads for offers (Release 5A). Lists are cached for CACHE_TTL.deals (5 minutes) under the tag `deals`, which
 * every deal, coupon, link and store write clears. The cached lists include offers that start within the next 15
 * minutes, and EVERY call filters them again with the clock at call time (window.ts), so:
 *   - an offer that ended since the list was cached is dropped, and one that has started is shown;
 *   - the only staleness left is the page's own cache (the /deals page revalidates every 5 minutes).
 */

const cachedPage = unstable_cache(() => repo.selectDealsPage(100), ["deals-page"], { revalidate: CACHE_TTL.deals, tags: [CACHE_TAGS.deals] });
const cachedForMerchant = unstable_cache((merchantId: string) => repo.selectDealsForMerchant(merchantId, 20), ["deals-merchant"], { revalidate: CACHE_TTL.deals, tags: [CACHE_TAGS.deals] });
const cachedForProduct = unstable_cache((productId: string) => repo.selectDealsForProduct(productId, 12), ["deals-product"], { revalidate: CACHE_TTL.deals, tags: [CACHE_TAGS.deals] });

export async function getDealsPage(now: Date = new Date()): Promise<DealsPage> {
  const page = await cachedPage();
  return { deals: liveDeals(page.deals, now), coupons: onlyLive(page.coupons, now) };
}

export async function getDealsForMerchant(merchantId: string, now: Date = new Date()): Promise<PublicDeal[]> {
  return liveDeals(await cachedForMerchant(merchantId), now);
}

export async function getDealsForProduct(productId: string, now: Date = new Date()): Promise<PublicDeal[]> {
  return liveDeals(await cachedForProduct(productId), now);
}
