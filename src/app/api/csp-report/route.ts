import { NextResponse, type NextRequest } from "next/server";
import { summariseReport } from "@/core/security/csp-report";
import { clientKey, createRateLimiter } from "@/core/security/rate-limit";

/**
 * Release 7B: where browsers send Content-Security-Policy violation reports (the policy starts in report-only mode).
 * A PUBLIC write endpoint, so it is deliberately cheap and safe: no database, a small body limit, a per-visitor rate limit,
 * and it only writes one short line to the Vercel logs. Always answers 204 so it can never be used to probe anything.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
export async function POST(request: NextRequest) {
  const empty = { status: 204, headers: { "Cache-Control": "no-store" } } as const;
  if (!limiter.allow(clientKey(request.headers))) return new NextResponse(null, empty);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return new NextResponse(null, empty);
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, empty);
    const summary = summariseReport(JSON.parse(text));
    if (summary) console.warn(JSON.stringify({ event: "khushio.csp", ...summary }));
  } catch {
    // Not JSON or unreadable: nothing to log, nothing to tell the sender.
  }
  return new NextResponse(null, empty);
}
