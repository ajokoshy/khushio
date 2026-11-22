import { env } from "@/core/config/env";
import { getAllSitemapEntries, getSitemapPlan } from "@/modules/seo/service";
import { indexXml, urlsetXml } from "@/modules/seo/sitemap";

/**
 * Release 7A: /sitemap.xml is ONE file of URLs while the site has at most 5,000, and a sitemap INDEX (one file per kind,
 * products in numbered files) beyond that. The data comes from the data cache (an hour, cleared by content writes).
 */
export const dynamic = "force-dynamic";

const headers = { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" };

export async function GET() {
  const { plan, counts } = await getSitemapPlan();
  const body = plan.mode === "index" ? indexXml(env.NEXT_PUBLIC_SITE_URL, plan.files) : urlsetXml(env.NEXT_PUBLIC_SITE_URL, await getAllSitemapEntries(counts));
  return new Response(body, { headers });
}
