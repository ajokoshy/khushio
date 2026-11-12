import { requireEnv } from "@/core/config/env";
import * as repo from "./repository";
import { evaluateThrottle, hashIdentifier, LOGIN_THROTTLE, type ThrottleDecision } from "./throttle";

/**
 * Database-backed half of the login rate limiter (Release 2C). The decision itself is the pure
 * function in ./throttle.ts. These helpers are called from the sign-in service, so every path to
 * sign-in (the login form and a direct POST to /api/auth/callback/credentials) is covered.
 */

function hashes(email: string, ip: string) {
  const secret = requireEnv("AUTH_SECRET");
  return { emailHash: hashIdentifier("email", email, secret), ipHash: hashIdentifier("ip", ip, secret) };
}

/** One indexed read. `email` must already be trimmed and lower-cased (the login schema does that). */
export async function checkLoginAllowed(email: string, ip: string, now: Date = new Date()): Promise<ThrottleDecision> {
  const { emailHash, ipHash } = hashes(email, ip);
  const since = new Date(now.getTime() - LOGIN_THROTTLE.windowMs);
  const rows = await repo.selectFailuresSince(emailHash, ipHash, since);
  return evaluateThrottle({
    now,
    emailFailures: rows.filter((r) => r.emailHash === emailHash).map((r) => r.createdAt),
    ipFailures: rows.filter((r) => r.ipHash === ipHash).map((r) => r.createdAt),
  });
}

/** Counts a failed attempt. Unknown emails are counted too, so the limiter does not reveal which emails exist. */
export async function recordFailedLogin(email: string, ip: string): Promise<void> {
  const { emailHash, ipHash } = hashes(email, ip);
  await repo.insertFailure(emailHash, ipHash);
}

/** After a successful sign-in: forget this email's failures and delete everything older than 7 days. */
export async function clearLoginFailures(email: string, now: Date = new Date()): Promise<void> {
  const { emailHash } = hashes(email, "");
  await repo.deleteFailuresForEmail(emailHash);
  await repo.deleteFailuresBefore(new Date(now.getTime() - LOGIN_THROTTLE.retentionMs));
}
