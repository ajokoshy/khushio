import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/**
 * Login rate limiting rules (Release 2C). Everything in this file is pure: no database, no
 * environment, so the decision can be unit tested at its boundaries.
 *
 * Rule: 5 failed attempts for one email, or 20 for one IP address, inside a 15 minute window block
 * further sign-in attempts (even with the right password) until enough failures age out of the window.
 * Blocked attempts are NOT recorded, so the block lifts at most 15 minutes after the last real failure.
 */
export const LOGIN_THROTTLE = {
  windowMs: 15 * 60 * 1000,
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 20,
  /** Old rows are deleted on the next successful sign-in, so no cron job is needed. */
  retentionMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export const THROTTLE_MESSAGE = "Too many failed attempts. Try again in 15 minutes.";

/** Used when no client address can be read (local development). All such requests share one bucket. */
export const UNKNOWN_IP = "unknown";

/**
 * Keyed hash (HMAC-SHA256, key = AUTH_SECRET) so the table never holds a raw email or IP address and
 * a leaked table cannot be reversed by hashing a list of known emails. The purpose prefix keeps an
 * email hash and an IP hash of the same text from ever being equal.
 */
export function hashIdentifier(purpose: "email" | "ip", value: string, secret: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

/**
 * Client address as seen by Vercel. Vercel overwrites these headers at the edge, so a visitor cannot
 * choose their own value there. Falls back to "unknown" for anything that is not a valid IP address.
 */
export function clientIpFromHeaders(headers: Pick<Headers, "get">): string {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip && isIP(ip) !== 0) return ip.toLowerCase();
  }
  return UNKNOWN_IP;
}

export type ThrottleInput = {
  now: Date;
  /** Times of recorded failures for this email hash (any age; old ones are ignored here). */
  emailFailures: readonly Date[];
  /** Times of recorded failures for this IP hash. */
  ipFailures: readonly Date[];
};

export type ThrottleDecision = { allowed: true } | { allowed: false; reason: "email" | "ip"; retryAt: Date };

/** When does a list of failures drop below `limit` again? Null if it is already below. */
function unblockTime(failures: readonly Date[], now: Date, limit: number): Date | null {
  const windowStart = now.getTime() - LOGIN_THROTTLE.windowMs;
  const recent = failures.map((d) => d.getTime()).filter((t) => t > windowStart).sort((a, b) => a - b);
  if (recent.length < limit) return null;
  // The failure that must age out for the count to fall to limit - 1.
  const pivot = recent[recent.length - limit] as number;
  return new Date(pivot + LOGIN_THROTTLE.windowMs);
}

export function evaluateThrottle({ now, emailFailures, ipFailures }: ThrottleInput): ThrottleDecision {
  const emailUntil = unblockTime(emailFailures, now, LOGIN_THROTTLE.maxFailuresPerEmail);
  const ipUntil = unblockTime(ipFailures, now, LOGIN_THROTTLE.maxFailuresPerIp);
  if (!emailUntil && !ipUntil) return { allowed: true };
  const retryAt = new Date(Math.max(emailUntil?.getTime() ?? 0, ipUntil?.getTime() ?? 0));
  return { allowed: false, reason: emailUntil ? "email" : "ip", retryAt };
}
