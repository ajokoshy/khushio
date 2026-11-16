import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The daily job's door (Release 4B). Vercel Cron calls the route with "Authorization: Bearer <CRON_SECRET>". The secret is
 * compared in constant time (both sides hashed first, so the length does not leak). A missing, short or wrong secret
 * is refused, and so is a deployment where CRON_SECRET was never set: nobody can run the job by accident.
 */
export const MIN_CRON_SECRET_LENGTH = 16;

const digest = (value: string) => createHash("sha256").update(value).digest();

export function isCronAuthorized(authorizationHeader: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false;
  if (!authorizationHeader) return false;
  const match = /^Bearer (.+)$/.exec(authorizationHeader.trim());
  if (!match) return false;
  return timingSafeEqual(digest(match[1] as string), digest(secret));
}
