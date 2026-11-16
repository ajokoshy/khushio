import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/core/config/env";
import { isCronAuthorized } from "@/modules/reports/cron-auth";
import { runDailyMaintenance } from "@/modules/reports/rollup";

/**
 * Daily roll-up and purge of affiliate clicks (Release 4B). Scheduled in vercel.json; Vercel sends
 * "Authorization: Bearer <CRON_SECRET>". Anything else, including a deployment without CRON_SECRET, gets a plain 401.
 * Safe to call again at any time: the roll-up never lowers a total and the purge only removes old rows.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });
  }
  try {
    const result = await runDailyMaintenance();
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error("Affiliate roll-up failed", error);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
