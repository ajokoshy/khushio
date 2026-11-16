"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/affiliate/service";
import { idSchema, programInputSchema } from "@/modules/affiliate/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createProgramAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const parsed = programInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createProgram(parsed.data, session.user.id);
    return { redirectTo: "/admin/programs?notice=created" };
  });
}

export async function updateProgramAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That programme does not exist.", values: stringValues(raw) };
    const parsed = programInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateProgram(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/programs?notice=updated" };
  });
}

export async function deleteProgramAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That programme does not exist." };
    await service.deleteProgram(entityId.data, session.user.id);
    return { ok: true, message: "Programme deleted.", redirectTo: "/admin/programs?notice=deleted" };
  });
}
