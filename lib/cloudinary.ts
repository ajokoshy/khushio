import { createHash } from "node:crypto";
import { MAX_STORED_PX, imgUrl, signingString } from "@/lib/media/delivery";

export type Uploaded = { publicId: string; url: string; width: number; height: number; bytes: number; format: string; existing: boolean };
const creds = () => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) throw new Error("Cloudinary environment variables are missing");
  return { cloud, key, secret };
};
const sign = (params: Record<string, string | number | boolean | undefined>, secret: string) => createHash("sha1").update(signingString(params) + secret).digest("hex");

/**
 * Signed upload. Cost controls:
 * - public_id is derived from the file's hash and overwrite=false, so the same picture is never stored twice;
 * - an incoming transformation caps the stored original at MAX_STORED_PX with automatic quality (smaller storage);
 * - no eager transformations: derived files are created lazily, and only for the fixed delivery widths.
 */
export async function uploadMedia(file: File, hash: string): Promise<Uploaded> {
  const { cloud, key, secret } = creds();
  const timestamp = String(Math.floor(Date.now() / 1000)), public_id = `khushio/${hash.slice(0, 20)}`;
  const params = { overwrite: "false", public_id, timestamp, transformation: `c_limit,h_${MAX_STORED_PX},w_${MAX_STORED_PX},q_auto:good` };
  const body = new FormData();
  body.set("file", file); body.set("api_key", key); body.set("signature", sign(params, secret));
  for (const [k, v] of Object.entries(params)) body.set(k, v);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
  const j = await res.json();
  return { publicId: j.public_id, url: j.secure_url, width: j.width, height: j.height, bytes: j.bytes, format: j.format, existing: !!j.existing };
}

/** Removes an image (and its derived files) from Cloudinary to give storage back. */
export async function destroyImage(publicId: string): Promise<void> {
  const { cloud, key, secret } = creds();
  const timestamp = String(Math.floor(Date.now() / 1000)), params = { public_id: publicId, timestamp };
  const body = new FormData();
  body.set("api_key", key); body.set("signature", sign(params, secret)); body.set("public_id", publicId); body.set("timestamp", timestamp);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, { method: "POST", body });
  if (!res.ok) throw new Error(`Cloudinary delete failed (${res.status})`);
}

/** Older call sites: upload and return only the URL. */
export async function uploadImage(file: File): Promise<string> {
  const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  return (await uploadMedia(file, hash)).url;
}
/** Delivery URL on the fixed width set (see lib/media/delivery.ts). */
export const cld = (src: string, w = 800) => imgUrl(src, w);
