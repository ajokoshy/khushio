import { NextResponse } from "next/server";
// Phase 4 implements: resolve link -> verify active -> validate merchant domain -> record click -> redirect.
export function GET() {
  return new NextResponse("Not found", { status: 404 });
}
