import { after, type NextRequest, NextResponse } from "next/server";
import { findGoLink, insertClick } from "@/modules/affiliate/click-repository";
import { handleGo } from "@/modules/affiliate/go";
import { clientKey, createRateLimiter } from "@/core/security/rate-limit";

/**
 * /go/[slug]: the only way a visitor leaves Khushio for a store (Release 4A). Node runtime on purpose: the Neon HTTP
 * driver is used the same way everywhere else, and a redirect that is one read plus one insert gains nothing from Edge.
 * The request's own query string is never read, so it cannot change where the visitor is sent.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Release 7B: a brake on click recording. The visitor is ALWAYS sent on to the store; only the database write is skipped when
 * one address makes more than 120 clicks a minute (a bot or a loop). Held in memory only; no address is stored.
 */
const clickLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

async function respond(request: NextRequest, context: { params: Promise<{ slug: string }> }, method: "GET" | "HEAD") {
  const { slug } = await context.params;
  try {
    const outcome = await handleGo(
      {
        slug,
        method,
        userAgent: request.headers.get("user-agent"),
        referer: request.headers.get("referer"),
        country: request.headers.get("x-vercel-ip-country"),
      },
      {
        findLink: findGoLink,
        recordClick: (click: Parameters<typeof insertClick>[0]) => (clickLimiter.allow(clientKey(request.headers)) ? insertClick(click) : Promise.resolve()),
        schedule: (work) => after(work),
        warn: (message, details) => console.warn(message, details),
      },
    );
    if (outcome.status === 302) return new NextResponse(null, { status: 302, headers: { ...HEADERS, Location: outcome.location } });
    return new NextResponse("Not found", { status: 404, headers: HEADERS });
  } catch (error) {
    console.error("go: lookup failed", error);
    return new NextResponse("Temporarily unavailable", { status: 503, headers: { ...HEADERS, "Retry-After": "30" } });
  }
}

export function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  return respond(request, context, "GET");
}

export function HEAD(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  return respond(request, context, "HEAD");
}
