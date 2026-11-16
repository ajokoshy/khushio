import { eq } from "drizzle-orm";
import { db } from "@/core/database/client";
import { affiliateClicks, affiliateLinks, merchants } from "@/core/database/schema";
import type { ClickRecord, GoLink } from "./go";

/** The only two queries the public /go route runs. */

/** One indexed read: affiliate_links_slug_unique, then merchants by primary key. */
export async function findGoLink(slug: string): Promise<GoLink | null> {
  const [row] = await db()
    .select({
      id: affiliateLinks.id,
      slug: affiliateLinks.slug,
      destinationUrl: affiliateLinks.destinationUrl,
      trackingParams: affiliateLinks.trackingParams,
      isActive: affiliateLinks.isActive,
      merchantActive: merchants.isActive,
      allowedDomains: merchants.allowedDomains,
    })
    .from(affiliateLinks)
    .innerJoin(merchants, eq(merchants.id, affiliateLinks.merchantId))
    .where(eq(affiliateLinks.slug, slug))
    .limit(1);
  return row ?? null;
}

/** One insert. No IP address, user agent or full referrer is stored (see docs/SECURITY.md). */
export async function insertClick(click: ClickRecord): Promise<void> {
  await db().insert(affiliateClicks).values(click);
}
