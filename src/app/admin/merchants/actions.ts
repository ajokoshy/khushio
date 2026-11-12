"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/merchants/service";
import { merchantInputSchema, idSchema } from "@/modules/merchants/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

/** Every action: permission first, then validation, then the service (rules, write, audit, cache tags). */

export async function createMerchantAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.merchantWrite);
    const parsed = merchantInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createMerchant(parsed.data, session.user.id);
    return { redirectTo: "/admin/merchants?notice=created" };
  });
}

export async function updateMerchantAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.merchantWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That merchant does not exist.", values: stringValues(raw) };
    const parsed = merchantInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateMerchant(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/merchants?notice=updated" };
  });
}

type Change = (id: string, actorId: string) => Promise<void>;

async function oneClick(id: string, change: Change, message: string, redirectTo?: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.merchantWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That merchant does not exist." };
    await change(entityId.data, session.user.id);
    return { ok: true, message, redirectTo };
  });
}

export async function archiveMerchantAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.archiveMerchant, "Merchant archived.");
}

export async function restoreMerchantAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.restoreMerchant, "Merchant restored.");
}

export async function deleteMerchantAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.deleteMerchant, "Merchant deleted.", "/admin/merchants?notice=deleted");
}
