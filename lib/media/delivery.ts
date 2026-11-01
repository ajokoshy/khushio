/**
 * Image delivery rules (pure). Cloudinary bills for every distinct derived image, so every URL we build uses
 * a small FIXED set of widths and one transformation recipe. A picture can therefore never produce more than
 * WIDTHS.length derived files, however many pages or screen sizes use it.
 */
export const WIDTHS = [320, 640, 960, 1280] as const;
/** The only transformation recipe used for delivery: automatic format and quality, never upscale. */
export const RECIPE = "f_auto,q_auto,c_limit";
/** Largest side we keep when an image is uploaded (stored original is capped here). */
export const MAX_STORED_PX = 1600;

/** Snaps any requested width up to the nearest allowed width (largest if bigger). */
export const snapWidth = (w: number) => WIDTHS.find((x) => x >= w) ?? WIDTHS[WIDTHS.length - 1];

const isCloudinaryUpload = (s: string) => /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(s);
const BARE_ID = /^[a-z0-9][a-z0-9_\-/]*$/i;

/**
 * Delivery URL for a Cloudinary full URL or a bare public id. Anything else (local files, other hosts) is returned unchanged.
 * Transformations already present in a stored URL are replaced, so old URLs also collapse onto the fixed recipe.
 */
export function imgUrl(src: string, w: number, cloudName = process.env.CLOUDINARY_CLOUD_NAME): string {
  const width = snapWidth(w);
  if (isCloudinaryUpload(src)) {
    const [head, tail] = src.split("/image/upload/");
    const rest = tail.split("/"); // drop any transformation segment(s) and keep version + public id
    const at = rest.findIndex((seg) => /^v\d+$/.test(seg));
    const keep = at >= 0 ? rest.slice(at) : rest.length > 1 && rest[0].includes(",") ? rest.slice(1) : rest;
    return `${head}/image/upload/${RECIPE},w_${width}/${keep.join("/")}`;
  }
  if (cloudName && !src.startsWith("/") && !/^https?:/i.test(src) && BARE_ID.test(src)) return `https://res.cloudinary.com/${cloudName}/image/upload/${RECIPE},w_${width}/${src}`;
  return src;
}

/** srcset using only the allowed widths that do not exceed the original (so we never ask for upscaled files). */
export function srcSet(src: string, originalWidth?: number | null, cloudName?: string): string | undefined {
  if (imgUrl(src, 320, cloudName) === src) return undefined; // not a Cloudinary image: no srcset
  const ws = WIDTHS.filter((w, i) => !originalWidth || w <= originalWidth || WIDTHS[i - 1] < originalWidth);
  return ws.map((w) => `${imgUrl(src, w, cloudName)} ${w}w`).join(", ");
}

/** Parameters that must be signed for an upload, in the order Cloudinary expects (alphabetical). */
export function signingString(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params).filter(([k, v]) => v !== undefined && v !== "" && !["file", "api_key", "resource_type", "cloud_name"].includes(k))
    .sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
}
