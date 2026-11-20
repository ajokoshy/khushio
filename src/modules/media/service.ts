import { logAuditBestEffort } from "@/core/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { uniqueViolationOf } from "@/core/validation/slug";
import { uploadProblem, type UploadResult } from "@/infrastructure/cloudinary/upload-rules";
import * as repo from "./repository";
import type { MediaRow, MediaUsageFilter, MediaWrite } from "./types";

/**
 * The media library: one row per file stored in Cloudinary. The same picture is stored once (content_hash is
 * Cloudinary's etag of the file), so a second upload of the same file reuses the first row.
 */

export async function listMedia(opts: { q?: string; usage: MediaUsageFilter; limit: number; offset: number }) {
  const rows = await repo.selectMedia({ ...opts, limit: opts.limit + 1 });
  return { rows: rows.slice(0, opts.limit), hasNext: rows.length > opts.limit };
}

export type RecordedUpload = { asset: MediaRow; /** The file was already in the library; the freshly uploaded copy is redundant. */ duplicate: boolean };

/**
 * Records a verified upload. If the same file (same hash) is already in the library, that row is returned with
 * `duplicate: true` and the caller removes the redundant copy from Cloudinary.
 */
export async function recordUpload(write: MediaWrite, actorId: string): Promise<RecordedUpload> {
  if (write.contentHash) {
    const same = await repo.selectMediaByHash(write.contentHash);
    if (same) return { asset: same, duplicate: same.publicId !== write.publicId };
  }
  const existing = await repo.selectMediaByPublicId(write.publicId);
  if (existing) return { asset: existing, duplicate: false };

  try {
    const asset = await repo.insertMedia(write);
    await logAuditBestEffort({ actor: actorId, action: "media.uploaded", entityType: "media", entityId: asset.id, metadata: { publicId: asset.publicId, bytes: asset.bytes } });
    return { asset, duplicate: false };
  } catch (error) {
    // Two admins uploading the same file at once: the unique hash index lets one win, the other reuses it.
    if (uniqueViolationOf(error) && write.contentHash) {
      const winner = (await repo.selectMediaByHash(write.contentHash)) ?? (await repo.selectMediaByPublicId(write.publicId));
      if (winner) return { asset: winner, duplicate: winner.publicId !== write.publicId };
    }
    throw error;
  }
}

export async function updateMediaAlt(id: string, alt: string | null, actorId: string): Promise<MediaRow> {
  const updated = await repo.updateMediaAltRow(id, alt);
  if (!updated) throw new NotFoundError("Image not found");
  await logAuditBestEffort({ actor: actorId, action: "media.alt_updated", entityType: "media", entityId: id, metadata: { publicId: updated.publicId } });
  return updated;
}

/**
 * Deletes a library entry that no product uses. `removeFromCloudinary` is passed in by the caller (the server action),
 * so this module stays free of the Cloudinary adapter. It must return true when the file is gone.
 */
export async function deleteUnusedMedia(id: string, actorId: string, removeFromCloudinary: (publicId: string) => Promise<boolean>): Promise<void> {
  const asset = await repo.selectMediaById(id);
  if (!asset) throw new NotFoundError("Image not found");
  const uses = await repo.countImageUses(asset.publicId);
  if (uses > 0) throw new ConflictError(`This file is used ${uses} time${uses === 1 ? "" : "s"} (product images, article covers, pictures in an article or page, or the homepage), so it cannot be deleted. Remove it from there first.`);
  if (!(await removeFromCloudinary(asset.publicId))) throw new ConflictError("The file could not be removed from Cloudinary. Try again in a moment.");
  await repo.deleteMediaRow(id);
  await logAuditBestEffort({ actor: actorId, action: "media.deleted", entityType: "media", entityId: id, metadata: { publicId: asset.publicId } });
}

export async function getMediaByPublicId(publicId: string): Promise<MediaRow | null> {
  return repo.selectMediaByPublicId(publicId);
}

/**
 * A browser upload that is not attached to a product (the article editor and the article cover). Same checks as a
 * product image: the signature proves Cloudinary stored the file, the rules limit type and size, and a file that is
 * already in the library is reused (the redundant copy is removed from Cloudinary).
 */
export async function addToLibrary(
  upload: UploadResult,
  alt: string | null,
  actorId: string,
  deps: { apiSecret: string; removeFromCloudinary: (publicId: string) => Promise<boolean> },
): Promise<MediaRow> {
  const problem = uploadProblem(upload, deps.apiSecret);
  if (problem) {
    if (problem !== "The upload could not be verified. Try again.") await deps.removeFromCloudinary(upload.public_id);
    throw new ValidationError("Upload rejected", { image: problem });
  }
  const { asset, duplicate } = await recordUpload({ publicId: upload.public_id, contentHash: upload.etag ?? null, width: upload.width, height: upload.height, bytes: upload.bytes, alt }, actorId);
  if (duplicate) await deps.removeFromCloudinary(upload.public_id);
  return asset;
}
