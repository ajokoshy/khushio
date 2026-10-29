import { after, NextResponse } from "next/server";
import { checkDestination, isBot, safeReferrer } from "@/lib/affiliate/rules";
import { strictDomains } from "@/lib/config/env";
import { site } from "@/lib/config/site";
import { resolveOffer } from "@/lib/data/catalog";
import { db, schema } from "@/lib/db";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
const unavailable = () => new NextResponse("This link is no longer available.", { status: 404, headers: NO_STORE });

/** Click logging is best effort: it runs after the response is sent and can never block or break the redirect. */
function logClick(row: { offerId: string; merchantId: string | null; referrer: string | null }) {
  const task = async () => { try { await db!.insert(schema.clicks).values(row); } catch { /* analytics must never affect visitors */ } };
  try { after(task); } catch { void task(); }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let offer;
  try { offer = await resolveOffer(id); } catch { return new NextResponse("Temporarily unavailable.", { status: 503, headers: { ...NO_STORE, "Retry-After": "60" } }); }
  if (!offer) return unavailable();
  // The destination always comes from our database, never from the request; it is re-validated on every hit.
  if (!checkDestination(offer.url, offer.approvedDomains, strictDomains()).ok) return unavailable();
  if (db && /^[0-9a-f-]{36}$/i.test(id) && req.method === "GET" && !isBot(req.headers.get("user-agent")))
    logClick({ offerId: id, merchantId: offer.merchantId, referrer: safeReferrer(req.headers.get("referer"), site.url) });
  return NextResponse.redirect(offer.url, { status: 302, headers: NO_STORE });
}
