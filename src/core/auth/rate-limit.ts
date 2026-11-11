import { createHmac } from "node:crypto";

export const LOGIN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 20,
} as const;

export type RateLimitConfig = typeof LOGIN_RATE_LIMIT;

export type FailureCounts = { email: number; ip: number | null };

export function isRateLimited(counts: FailureCounts, limits: RateLimitConfig = LOGIN_RATE_LIMIT): boolean {
  if (counts.email >= limits.maxFailuresPerEmail) return true;
  if (counts.ip !== null && counts.ip >= limits.maxFailuresPerIp) return true;
  return false;
}

export function windowStart(now: Date, limits: RateLimitConfig = LOGIN_RATE_LIMIT): Date {
  return new Date(now.getTime() - limits.windowMs);
}

/** Keyed hash so emails and IPs are never stored in the clear in audit_logs. */
export function rateKey(kind: "email" | "ip", value: string, secret: string): string {
  const normalised = kind === "email" ? value.trim().toLowerCase() : value.trim();
  return `${kind}:${createHmac("sha256", secret).update(normalised).digest("hex")}`;
}
