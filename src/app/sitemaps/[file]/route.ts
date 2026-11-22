import { env } from "@/core/config/env";
import { getSitemapEntries, getSitemapCounts } from "@/modules/seo/service";
import { parseSitemapFile, SITEMAP_CHUNK, urlsetXml } from "@/modules/seo/sitemap";

/** Release 7A: one file of the sitemap index, for example /sitemaps/products-2.xml. Unknown names and pages past the end are 404. */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const parsed = parseSitemapFile((await params).file);
  if (!parsed) return new Response("Not found", { status: 404 });
  if (parsed.kind === "products" && parsed.page > Math.max(1, Math.ceil((await getSitemapCounts()).products / SITEMAP_CHUNK))) return new Response("Not found", { status: 404 });
  const entries = await getSitemapEntries(parsed.kind, parsed.page);
  return new Response(urlsetXml(env.NEXT_PUBLIC_SITE_URL, entries), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
