import { timingSafeEqual } from "node:crypto";
import { runMaintenance } from "@/lib/maintenance";
export const dynamic = "force-dynamic";

/** Optional: call this daily from a Vercel cron job. Disabled (404) unless CRON_SECRET is set. Housekeeping also runs by itself on a sample of clicks. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });
  const given = req.headers.get("authorization") ?? "", want = `Bearer ${secret}`;
  if (given.length !== want.length || !timingSafeEqual(Buffer.from(given), Buffer.from(want))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runMaintenance(), { headers: { "Cache-Control": "no-store" } });
}
