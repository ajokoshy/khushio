import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getClientIp } from "@/core/security/ip";
import { authConfig } from "./config";
import { authenticate } from "./service";
import "./types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        return authenticate(credentials, { ip: getClientIp(request.headers) });
      },
    }),
  ],
});
