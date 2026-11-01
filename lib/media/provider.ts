import { cloudinaryConfigured } from "@/lib/config/env";
import { destroyImage, uploadMedia, type Uploaded } from "@/lib/cloudinary";
import { imgUrl } from "@/lib/media/delivery";

/**
 * The one boundary between the site and wherever images live. The admin only talks to this interface, so changing provider means
 * writing one more object here, not touching screens. Cloudinary is the default; "external" (MEDIA_PROVIDER=external) disables
 * uploads and serves image addresses exactly as stored (for example images hosted elsewhere).
 */
export interface MediaProvider {
  name: string;
  configured(): boolean;
  upload(file: File, hash: string): Promise<Uploaded>;
  destroy(publicId: string): Promise<void>;
  url(idOrUrl: string, width: number): string;
}
export const cloudinaryProvider: MediaProvider = { name: "cloudinary", configured: () => cloudinaryConfigured(), upload: uploadMedia, destroy: destroyImage, url: (id, w) => imgUrl(id, w) };
export const externalProvider: MediaProvider = { name: "external", configured: () => false, upload: async () => { throw new Error("Uploads are not available with the external media provider"); }, destroy: async () => {}, url: (id) => id };
export const getProvider = (env: Record<string, string | undefined> = process.env): MediaProvider => (env.MEDIA_PROVIDER === "external" ? externalProvider : cloudinaryProvider);
