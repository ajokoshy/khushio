"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import { apiSecret, createUploadSignature, destroyAsset, type UploadSignature } from "@/infrastructure/cloudinary";
import type { UploadResult } from "@/infrastructure/cloudinary/upload-rules";
import { uploadResultSchema, pickerQuerySchema } from "@/modules/content/validation";
import { configFromForm } from "@/modules/homepage/config";
import * as service from "@/modules/homepage/service";
import { idSchema, moveDirectionSchema, sectionInputSchema } from "@/modules/homepage/validation";
import { addToLibrary, listMedia } from "@/modules/media/service";
import { invalidForm, runAction, runDataAction, runFormAction, stringValues, type DataResult, type Failure } from "@/shared/admin/action-helpers";
import type { PickerImage } from "@/shared/admin/content/image-picker";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createSectionAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.homepageWrite);
    const parsed = sectionInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createSection(parsed.data, configFromForm(parsed.data.type, raw), session.user.id);
    return { redirectTo: "/admin/homepage?notice=created" };
  });
}

export async function updateSectionAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.homepageWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That section does not exist.", values: stringValues(raw) };
    const parsed = sectionInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    // The stored type decides which settings are read; the posted one is ignored by the service.
    const current = await service.getSection(entityId.data);
    await service.updateSection(entityId.data, parsed.data, configFromForm(current.type, raw), session.user.id);
    return { redirectTo: "/admin/homepage?notice=updated" };
  });
}

export async function deleteSectionAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.homepageWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That section does not exist." };
    await service.deleteSection(entityId.data, session.user.id);
    return { ok: true, message: "Section deleted.", redirectTo: "/admin/homepage?notice=deleted" };
  });
}

/** The list's small buttons are plain forms that always end by redirecting back with a notice, so they work without JavaScript. */
async function listButton(work: (actorId: string) => Promise<void>, notice: string): Promise<void> {
  let target = `/admin/homepage?notice=${notice}`;
  try {
    const session = await requirePermission(P.homepageWrite);
    await work(session.user.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) target = "/admin-login";
    else {
      if (!(error instanceof ForbiddenError)) console.error("Homepage action failed", error);
      target = "/admin/homepage?notice=failed";
    }
  }
  redirect(target);
}

export async function moveSectionAction(formData: FormData): Promise<void> {
  const id = idSchema.safeParse(formData.get("id"));
  const direction = moveDirectionSchema.safeParse(formData.get("direction"));
  if (!id.success || !direction.success) return redirect("/admin/homepage?notice=failed");
  await listButton((actor) => service.moveSection(id.data, direction.data, actor), "moved");
}

export async function toggleSectionAction(formData: FormData): Promise<void> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return redirect("/admin/homepage?notice=failed");
  const enable = formData.get("enable") === "1";
  await listButton((actor) => service.setEnabled(id.data, enable, actor), enable ? "enabled" : "disabled");
}

export async function createStarterLayoutAction(): Promise<void> {
  await listButton(async (actor) => void (await service.createStarterLayout(actor)), "starter");
}

export async function refreshHomepageAction(): Promise<void> {
  await listButton((actor) => service.refreshHomepage(actor), "refreshed");
}

/* ------------- the hero picture picker (same signed upload as articles, gated by homepage:write) ------------- */

const toPicker = (m: { publicId: string; alt: string | null; width: number | null; height: number | null }): PickerImage => ({ publicId: m.publicId, alt: m.alt ?? "", width: m.width ?? 0, height: m.height ?? 0 });

export async function searchHomepageImagesAction(query: string): Promise<DataResult<PickerImage[]>> {
  return runDataAction(async () => {
    await requirePermission(P.homepageWrite);
    const { rows } = await listMedia({ q: pickerQuerySchema.parse(query) || undefined, usage: "all", limit: 24, offset: 0 });
    return rows.map(toPicker);
  });
}

export async function getHomepageUploadSignatureAction(): Promise<DataResult<UploadSignature>> {
  return runDataAction(async () => {
    await requirePermission(P.homepageWrite);
    return createUploadSignature();
  });
}

export async function addHomepageImageAction(upload: unknown, alt: string): Promise<DataResult<PickerImage>> {
  return runDataAction(async () => {
    const session = await requirePermission(P.homepageWrite);
    const parsed = uploadResultSchema.safeParse(upload);
    if (!parsed.success) throw new Error("The upload result was not understood.");
    const asset = await addToLibrary(parsed.data satisfies UploadResult, alt.trim().slice(0, 200) || null, session.user.id, { apiSecret: apiSecret(), removeFromCloudinary: destroyAsset });
    return toPicker(asset);
  });
}
