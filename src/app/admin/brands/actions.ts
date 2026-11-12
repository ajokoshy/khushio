"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/discover/service";
import { brandInputSchema, idSchema } from "@/modules/discover/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

/** Every action: permission first, then validation, then the service (rules, write, audit, cache tags). */

export async function createBrandAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.brandWrite);
    const parsed = brandInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createBrand(parsed.data, session.user.id);
    return { redirectTo: "/admin/brands?notice=created" };
  });
}

export async function updateBrandAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.brandWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That brand does not exist.", values: stringValues(raw) };
    const parsed = brandInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateBrand(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/brands?notice=updated" };
  });
}

type Change = (id: string, actorId: string) => Promise<void>;

async function oneClick(id: string, change: Change, message: string, redirectTo?: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.brandWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That brand does not exist." };
    await change(entityId.data, session.user.id);
    return { ok: true, message, redirectTo };
  });
}

export async function archiveBrandAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.archiveBrand, "Brand archived.");
}

export async function restoreBrandAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.restoreBrand, "Brand restored.");
}

export async function deleteBrandAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.deleteBrand, "Brand deleted.", "/admin/brands?notice=deleted");
}
