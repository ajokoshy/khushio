import NextAuth from "next-auth";
import { authConfig } from "@/core/auth/config";

// Middleware only redirects signed-out visitors. Every admin page, action and API still
// checks permissions on the server (see src/core/permissions/require.ts).
export default NextAuth(authConfig).auth;

export const config = { matcher: ["/admin", "/admin/:path*", "/admin-login"] };
