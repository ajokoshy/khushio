import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { authenticate } from "./service";
import { clientIpFromHeaders } from "./throttle";
import "./types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (credentials, request) => authenticate(credentials, { ip: clientIpFromHeaders(request.headers) }),
    }),
  ],
});
