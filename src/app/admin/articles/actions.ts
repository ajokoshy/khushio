"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import { apiSecret, createUploadSignature, destroyAsset, type UploadSignature } from "@/infrastructure/cloudinary";
import type { UploadResult } from "@/infrastructure/cloudinary/upload-rules";
import * as service from "@/modules/content/service";
import { articleInputSchema, idSchema, pickerQuerySchema, uploadResultSchema } from "@/modules/content/validation";
import { addToLibrary, listMedia } from "@/modules/media/service";
import { searchProductsForEmbed } from "@/modules/products/service";
import type { ProductPickerItem } from "@/shared/admin/content/product-picker";
import { invalidForm, runAction, runDataAction, runFormAction, type DataResult, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";
import type { PickerImage } from "@/shared/admin/content/image-picker";
import { whoOf } from "@/shared/admin/content/who";

export async function createArticleAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.contentWrite);
    const parsed = articleInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createArticle(parsed.data, whoOf(session));
    return { redirectTo: "/admin/articles?notice=created" };
  });
}

export async function updateArticleAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.contentWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That article does not exist.", values: {} };
    const parsed = articleInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateArticle(entityId.data, parsed.data, whoOf(session));
    return { redirectTo: "/admin/articles?notice=updated" };
  });
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.contentWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That article does not exist." };
    await service.deleteArticle(entityId.data, whoOf(session));
    return { ok: true, message: "Article deleted.", redirectTo: "/admin/articles?notice=deleted" };
  });
}

/* ------------- the editor's image picker (shared by articles and pages) ------------- */

const toPicker = (m: { publicId: string; alt: string | null; width: number | null; height: number | null }): PickerImage => ({ publicId: m.publicId, alt: m.alt ?? "", width: m.width ?? 0, height: m.height ?? 0 });

export async function searchEditorImagesAction(query: string): Promise<DataResult<PickerImage[]>> {
  return runDataAction(async () => {
    await requirePermission(P.contentWrite);
    const q = pickerQuerySchema.parse(query);
    const { rows } = await listMedia({ q: q || undefined, usage: "all", limit: 24, offset: 0 });
    return rows.map(toPicker);
  });
}

export async function getEditorUploadSignatureAction(): Promise<DataResult<UploadSignature>> {
  return runDataAction(async () => {
    await requirePermission(P.contentWrite);
    return createUploadSignature();
  });
}

export async function addEditorImageAction(upload: unknown, alt: string): Promise<DataResult<PickerImage>> {
  return runDataAction(async () => {
    const session = await requirePermission(P.contentWrite);
    const parsed = uploadResultSchema.safeParse(upload);
    if (!parsed.success) throw new Error("The upload result was not understood.");
    const asset = await addToLibrary(parsed.data satisfies UploadResult, alt.trim().slice(0, 200) || null, session.user.id, { apiSecret: apiSecret(), removeFromCloudinary: destroyAsset });
    return toPicker(asset);
  });
}

/** Release 6B: the editor's product picker. Offers products by name, any status except archived; the article keeps only the id. */
export async function searchEditorProductsAction(query: string): Promise<DataResult<ProductPickerItem[]>> {
  return runDataAction(async () => {
    await requirePermission(P.contentWrite);
    return searchProductsForEmbed(pickerQuerySchema.parse(query));
  });
}
