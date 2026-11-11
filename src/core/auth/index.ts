import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { authenticate } from "./service";
import "./types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (credentials) => authenticate(credentials),
    }),
  ],
});
