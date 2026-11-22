import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/core/auth/config";
import { handleRedirect } from "@/modules/redirects/middleware";

const adminAuth = NextAuth(authConfig).auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<NextResponse | Response | undefined> | NextResponse | Response | undefined;

const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/") || path === "/admin-login";

/**
 * Two jobs, split by address:
 *   /admin and /admin-login  Auth.js only redirects signed-out visitors. Every admin page, action and API still checks
 *                            permissions on the server (see src/core/permissions/require.ts).
 *   public pages (7A)        one in-memory lookup in the redirect map: 301/302 to the new address, or a 410 page for
 *                            something removed on purpose (src/modules/redirects). No database query per visitor.
 */
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isAdminPath(request.nextUrl.pathname)) return adminAuth(request, event);
  return (await handleRedirect(request, event)) ?? NextResponse.next();
}

/** Not run for: the API (including the redirect map itself), /go (kept lightweight), Next.js internals, brand files, and anything with a file extension (sitemaps, robots.txt, images). */
export const config = { matcher: ["/((?!api/|go/|_next/|brand/|.*\\..*).*)"] };
