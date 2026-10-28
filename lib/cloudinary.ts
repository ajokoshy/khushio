import { createHash } from "node:crypto";
/** Signed upload to Cloudinary. Credentials come only from environment variables. */
export async function uploadImage(file: File): Promise<string> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) throw new Error("Cloudinary environment variables are missing");
  const timestamp = String(Math.floor(Date.now() / 1000)), folder = "khushio/products";
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");
  const body = new FormData();
  body.set("file", file); body.set("api_key", key); body.set("timestamp", timestamp); body.set("folder", folder); body.set("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
  return (await res.json()).secure_url as string;
}
/** Delivery URL with automatic format/quality and a width cap, so Cloudinary serves small files. */
export const cld = (url: string, w = 800) => (url.includes("/upload/") ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${w}/`) : url);
