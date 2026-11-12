"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/discover/service";
import { categoryInputSchema, idSchema } from "@/modules/discover/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

/** Every action: permission first, then validation, then the service (rules, write, audit, cache tags). */

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.categoryWrite);
    const parsed = categoryInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createCategory(parsed.data, session.user.id);
    return { redirectTo: "/admin/categories?notice=created" };
  });
}

export async function updateCategoryAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.categoryWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That category does not exist.", values: stringValues(raw) };
    const parsed = categoryInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateCategory(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/categories?notice=updated" };
  });
}

type Change = (id: string, actorId: string) => Promise<void>;

async function oneClick(id: string, change: Change, message: string, redirectTo?: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.categoryWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That category does not exist." };
    await change(entityId.data, session.user.id);
    return { ok: true, message, redirectTo };
  });
}

export async function archiveCategoryAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.archiveCategory, "Category archived.");
}

export async function restoreCategoryAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.restoreCategory, "Category restored.");
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.deleteCategory, "Category deleted.", "/admin/categories?notice=deleted");
}
