import { env } from "@/core/config/env";
import { signParams } from "./sign";
import { buildImageUrl, buildSrcSet, type ImageProfile } from "./images";
import { ALLOWED_FORMATS, UPLOAD_FOLDER } from "./upload-rules";

/** Server-only adapter to Cloudinary. The API secret is read here and nowhere else. */

export function cloudinaryConfigured(): boolean {
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function credentials() {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
  return { cloudName, apiKey, apiSecret };
}

export function apiSecret(): string {
  return credentials().apiSecret;
}

export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  allowedFormats: string;
  signature: string;
  uploadUrl: string;
};

/** Signed parameters for ONE browser upload, locked to the products folder and the allowed formats. */
export function createUploadSignature(now: number = Date.now()): UploadSignature {
  const { cloudName, apiKey, apiSecret: secret } = credentials();
  const timestamp = Math.floor(now / 1000);
  const allowedFormats = ALLOWED_FORMATS.join(",");
  const signature = signParams({ allowed_formats: allowedFormats, folder: UPLOAD_FOLDER, timestamp }, secret);
  return { cloudName, apiKey, timestamp, folder: UPLOAD_FOLDER, allowedFormats, signature, uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload` };
}

/** Deletes an image from Cloudinary. True when it is gone (including "was already gone"), false when the call failed. */
export async function destroyAsset(publicId: string): Promise<boolean> {
  const { cloudName, apiKey, apiSecret: secret } = credentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature: signParams({ public_id: publicId, timestamp }, secret),
  });
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const json = (await response.json()) as { result?: string };
    return json.result === "ok" || json.result === "not found";
  } catch (error) {
    console.error("Cloudinary destroy failed", error);
    return false;
  }
}

/** URL for one of the four image profiles, or null when Cloudinary is not configured (the UI shows a placeholder). */
export function imageUrl(publicId: string, profile: ImageProfile): string | null {
  return env.CLOUDINARY_CLOUD_NAME ? buildImageUrl(env.CLOUDINARY_CLOUD_NAME, publicId, profile) : null;
}

export function imageSrcSet(publicId: string, profiles: readonly ImageProfile[]): string | null {
  return env.CLOUDINARY_CLOUD_NAME ? buildSrcSet(env.CLOUDINARY_CLOUD_NAME, publicId, profiles) : null;
}

export { IMAGE_PROFILES, type ImageProfile } from "./images";
