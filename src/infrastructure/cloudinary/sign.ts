import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Cloudinary request signing (no SDK needed). A signature is sha1 of the parameters sorted by name,
 * written as name=value pairs joined with "&", with the API secret appended. The secret never leaves the server.
 */
export function signParams(params: Record<string, string | number | undefined>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

/**
 * Cloudinary signs every upload RESPONSE over public_id and version. Checking it proves the browser is
 * reporting a file Cloudinary really stored, not a public_id it made up.
 */
export function verifyUploadResponseSignature(input: { publicId: string; version: number; signature: string }, apiSecret: string): boolean {
  const expected = createHash("sha1").update(`public_id=${input.publicId}&version=${input.version}${apiSecret}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
