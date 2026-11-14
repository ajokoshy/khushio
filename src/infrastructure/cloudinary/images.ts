/**
 * The only image sizes the site uses (brief: upload once, deliver through fixed transformations).
 * Adding a size means adding a Cloudinary transformation, so there are exactly four.
 */
export const IMAGE_PROFILES = {
  thumbnail: { width: 160, height: 160, crop: "c_fill,g_auto" },
  card: { width: 480, height: null, crop: "c_limit" },
  product: { width: 800, height: null, crop: "c_limit" },
  editorial: { width: 1200, height: null, crop: "c_limit" },
} as const;

export type ImageProfile = keyof typeof IMAGE_PROFILES;

/** Keeps the slashes of a folder path, encodes everything else. */
function encodePublicId(publicId: string): string {
  return publicId.split("/").map(encodeURIComponent).join("/");
}

export function buildImageUrl(cloudName: string, publicId: string, profile: ImageProfile): string {
  const p = IMAGE_PROFILES[profile];
  const size = p.height ? `w_${p.width},h_${p.height}` : `w_${p.width}`;
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/f_auto,q_auto,${p.crop},${size}/${encodePublicId(publicId)}`;
}

/** "url 480w, url 800w" for <img srcset>. */
export function buildSrcSet(cloudName: string, publicId: string, profiles: readonly ImageProfile[]): string {
  return profiles.map((profile) => `${buildImageUrl(cloudName, publicId, profile)} ${IMAGE_PROFILES[profile].width}w`).join(", ");
}
