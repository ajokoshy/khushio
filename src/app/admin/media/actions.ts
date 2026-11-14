"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { destroyAsset } from "@/infrastructure/cloudinary";
import { deleteUnusedMedia, updateMediaAlt } from "@/modules/media/service";
import { altTextSchema, idSchema } from "@/modules/products/validation";
import { runAction } from "@/shared/admin/action-helpers";
import type { ActionResult } from "@/shared/admin/form-state";

/** Media library actions: permission first, then validation, then the service (rules, write, audit). */

export async function updateMediaAltAction(id: string, alt: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.mediaWrite);
    const mediaId = idSchema.safeParse(id);
    const text = altTextSchema.safeParse(alt);
    if (!mediaId.success) return { ok: false, error: "That image does not exist." };
    if (!text.success) return { ok: false, error: text.error.issues[0]?.message ?? "Enter a description." };
    await updateMediaAlt(mediaId.data, text.data, session.user.id);
    return { ok: true, message: "Description saved." };
  });
}

export async function deleteMediaAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.mediaWrite);
    const mediaId = idSchema.safeParse(id);
    if (!mediaId.success) return { ok: false, error: "That image does not exist." };
    await deleteUnusedMedia(mediaId.data, session.user.id, destroyAsset);
    return { ok: true, message: "Image deleted." };
  });
}
