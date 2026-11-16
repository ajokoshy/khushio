"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/affiliate/service";
import { idSchema, networkInputSchema } from "@/modules/affiliate/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

/** Every action: permission first, then validation, then the service (rules, write, audit). */

export async function createNetworkAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const parsed = networkInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createNetwork(parsed.data, session.user.id);
    return { redirectTo: "/admin/networks?notice=created" };
  });
}

export async function updateNetworkAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That network does not exist.", values: stringValues(raw) };
    const parsed = networkInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateNetwork(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/networks?notice=updated" };
  });
}

export async function deleteNetworkAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That network does not exist." };
    await service.deleteNetwork(entityId.data, session.user.id);
    return { ok: true, message: "Network deleted.", redirectTo: "/admin/networks?notice=deleted" };
  });
}
