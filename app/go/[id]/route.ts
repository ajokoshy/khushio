import { NextResponse } from "next/server";
import { findOffer } from "@/lib/data/catalog";
// Affiliate redirect. Phase 2: also insert a row into `clicks` here.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const offer = findOffer((await params).id);
  if (!offer || !offer.url.startsWith("https://")) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(offer.url, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
