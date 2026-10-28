import { NextResponse } from "next/server";
import { findOfferAsync } from "@/lib/data/catalog";
import { db, schema } from "@/lib/db";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await findOfferAsync(id);
  if (!offer || !offer.url.startsWith("https://")) return new NextResponse("Not found", { status: 404 });
  if (db && /^[0-9a-f-]{36}$/i.test(id)) { try { await db.insert(schema.clicks).values({ offerId: id, referrer: req.headers.get("referer") }); } catch {} }
  const res = NextResponse.redirect(offer.url, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
