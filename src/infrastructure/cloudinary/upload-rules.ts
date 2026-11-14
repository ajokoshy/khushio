import { verifyUploadResponseSignature } from "./sign";

/** Rules for a product image upload. The browser uploads straight to Cloudinary; the server checks what came back. */
export const UPLOAD_FOLDER = "khushio/products";
export const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_SIDE = 8000; // pixels
export const MAX_IMAGES_PER_PRODUCT = 12;

/** The fields of Cloudinary's upload response that the server uses. */
export type UploadResult = {
  public_id: string;
  version: number;
  signature: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  resource_type: string;
  etag?: string;
};

/** Returns a message for the first rule the upload breaks, or null when it is acceptable. Pure. */
export function uploadProblem(result: UploadResult, apiSecret: string): string | null {
  if (!verifyUploadResponseSignature({ publicId: result.public_id, version: result.version, signature: result.signature }, apiSecret)) {
    return "The upload could not be verified. Try again.";
  }
  if (result.resource_type !== "image") return "Only images can be uploaded.";
  const publicId = result.public_id;
  if (!publicId.startsWith(`${UPLOAD_FOLDER}/`) || publicId.includes("..") || publicId.length > 200) return "The image is not in the products folder.";
  if (!(ALLOWED_FORMATS as readonly string[]).includes(result.format.toLowerCase())) return `Use a ${ALLOWED_FORMATS.join(", ")} image.`;
  if (result.bytes > MAX_IMAGE_BYTES) return `The image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  if (result.width > MAX_IMAGE_SIDE || result.height > MAX_IMAGE_SIDE) return `The image is larger than ${MAX_IMAGE_SIDE} pixels on one side.`;
  return null;
}
