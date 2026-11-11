"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/core/auth";
import { loginSchema } from "@/core/auth/validation";
import { safeCallbackPath } from "@/core/security/redirects";

export type LoginResult = { ok: true; redirectTo: string } | { ok: false; error: string };

const GENERIC_ERROR = "Invalid email or password.";

export async function loginAction(input: unknown, callbackUrl?: string | null): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password." };
  const { email, password } = parsed.data;

  try {
    const result: unknown = await signIn("credentials", { email, password, redirect: false });
    // Depending on the Auth.js version a failed sign-in either throws or returns a URL with ?error=.
    if (typeof result === "string" && new URL(result, "http://localhost").searchParams.has("error")) {
      return { ok: false, error: GENERIC_ERROR };
    }
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: GENERIC_ERROR };
    throw error;
  }

  return { ok: true, redirectTo: safeCallbackPath(callbackUrl) };
}
