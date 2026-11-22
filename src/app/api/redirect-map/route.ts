import { NextResponse } from "next/server";
import { toWire } from "@/modules/redirects/path";
import { getRedirectRules } from "@/modules/redirects/public";

/**
 * Release 7A: the redirect map the middleware reads (see src/modules/redirects/middleware.ts). It holds only old and new
 * public addresses, nothing private. The data comes from the data cache (one database read an hour, cleared by every
 * redirect change), so asking for it costs the database nothing. Not indexed (robots.txt disallows /api).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ rules: toWire(await getRedirectRules()) }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
  } catch (error) {
    console.error("Redirect map unavailable", error);
    // The middleware treats a failure as "no redirects for now" and tries again shortly; the site itself keeps working.
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
