import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed homepage preview links (Release 6B). A token is "<expiry in ms>.<signature>", the signature an HMAC of the expiry
 * with the site's AUTH_SECRET. The preview page ALSO requires a signed-in person with homepage:write, so a leaked link alone
 * shows nothing, and it stops working by itself after PREVIEW_TTL_MS.
 */
export const PREVIEW_TTL_MS = 60 * 60 * 1000;

const sign = (secret: string, expiry: number) => createHmac("sha256", secret).update(`homepage-preview:${expiry}`).digest("base64url");

export function signPreviewToken(secret: string, now: Date = new Date(), ttlMs: number = PREVIEW_TTL_MS): string {
  const expiry = now.getTime() + ttlMs;
  return `${expiry}.${sign(secret, expiry)}`;
}

export type PreviewCheck = "ok" | "expired" | "invalid";

export function verifyPreviewToken(secret: string, token: unknown, now: Date = new Date()): PreviewCheck {
  if (typeof token !== "string") return "invalid";
  const match = /^(\d{10,16})\.([A-Za-z0-9_-]{20,128})$/.exec(token);
  if (!match) return "invalid";
  const expiry = Number(match[1]);
  const given = Buffer.from(match[2] as string);
  const wanted = Buffer.from(sign(secret, expiry));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return "invalid";
  return expiry > now.getTime() ? "ok" : "expired";
}
