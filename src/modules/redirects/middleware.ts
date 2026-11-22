import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { createRedirectCache } from "./edge-cache";
import { fromWire, lookupRedirect, type RedirectRule } from "./path";

/**
 * Release 7A: the redirect step of the middleware. It runs for public pages only (the matcher in src/middleware.ts leaves
 * out /api, /go, /_next, files and the admin) and does one in-memory lookup per request. The map is loaded from
 * /api/redirect-map, which reads the database once an hour (and straight after any redirect change) through the data cache.
 */

const cache = createRedirectCache();

const GONE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>This page has been removed | Khushio</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:6rem auto;padding:0 1rem;text-align:center;color:#1f2a24"><h1 style="font-size:1.75rem">This page has been removed</h1><p>It was taken down on purpose and will not come back.</p><p><a href="/" style="color:#1f4d3a">Back to the Khushio home page</a></p></body></html>`;

export function goneResponse(): NextResponse {
  return new NextResponse(GONE_HTML, { status: 410, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "public, max-age=0, s-maxage=300" } });
}

async function loadRules(origin: string): Promise<RedirectRule[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(new URL("/api/redirect-map", origin), { headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`redirect map answered ${response.status}`);
    return fromWire(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Returns a redirect (301/302) or a 410 page when a rule matches, otherwise null so the request carries on normally. */
export async function handleRedirect(request: NextRequest, event?: NextFetchEvent): Promise<NextResponse | null> {
  try {
    const { map, refresh } = await cache.get(() => loadRules(request.nextUrl.origin));
    if (refresh && event) event.waitUntil(refresh);
    const rule = lookupRedirect(map, request.nextUrl.pathname);
    if (!rule) return null;
    if (rule.statusCode === 410 || rule.toPath === null) return goneResponse();
    const target = new URL(rule.toPath, request.nextUrl.origin);
    target.search = request.nextUrl.search; // tracking parameters survive the hop
    return NextResponse.redirect(target, rule.statusCode);
  } catch (error) {
    console.error("Redirect lookup failed, continuing without it", error);
    return null;
  }
}
