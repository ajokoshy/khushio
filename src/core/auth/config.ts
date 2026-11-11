import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config. It is imported by middleware, so it must not import the
 * database, bcrypt, or anything else that needs Node. The Credentials provider lives in ./index.ts.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export const authConfig = {
  pages: { signIn: "/admin-login" },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [],
  callbacks: {
    /** Middleware gate: redirects only. The real permission checks run in server code. */
    authorized({ auth, request: { nextUrl } }) {
      const signedIn = !!auth?.user;
      const path = nextUrl.pathname;
      if (path === "/admin" || path.startsWith("/admin/")) return signedIn; // false → Auth.js redirects to /admin-login
      if (path === "/admin-login" && signedIn) return Response.redirect(new URL("/admin/dashboard", nextUrl));
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.roles = user.roles;
        token.permissions = user.permissions;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid ?? "";
      session.user.roles = token.roles ?? [];
      session.user.permissions = token.permissions ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;
