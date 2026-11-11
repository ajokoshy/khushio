import { unstable_cache } from "next/cache";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import * as repo from "./repository";
import type { DashboardStats } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Three cheap count queries in one round, cached for CACHE_TTL.dashboard seconds. */
const loadStats = unstable_cache(
  async (): Promise<DashboardStats> => {
    const since = new Date(Date.now() - 7 * DAY_MS);
    const [products, affiliateLinks, clicksLast7Days] = await Promise.all([
      repo.countProducts(),
      repo.countAffiliateLinks(),
      repo.countClicksSince(since),
    ]);
    return { products, affiliateLinks, clicksLast7Days };
  },
  ["dashboard-stats"],
  { revalidate: CACHE_TTL.dashboard, tags: [CACHE_TAGS.dashboard] },
);

export function getDashboardStats(): Promise<DashboardStats> {
  return loadStats();
}
