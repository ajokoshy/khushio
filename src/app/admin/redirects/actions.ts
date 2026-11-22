"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/redirects/service";
import { idSchema, redirectInputSchema } from "@/modules/redirects/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createRedirectAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.seoWrite);
    const parsed = redirectInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createRule(parsed.data, session.user.id);
    return { redirectTo: "/admin/redirects?notice=created" };
  });
}

export async function updateRedirectAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.seoWrite);
    const ruleId = idSchema.safeParse(id);
    if (!ruleId.success) return { ok: false, error: "That redirect does not exist.", values: stringValues(raw) };
    const parsed = redirectInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateRule(ruleId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/redirects?notice=updated" };
  });
}

export async function deleteRedirectAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.seoWrite);
    const ruleId = idSchema.safeParse(id);
    if (!ruleId.success) return { ok: false, error: "That redirect does not exist." };
    await service.deleteRule(ruleId.data, session.user.id);
    return { ok: true, message: "Redirect deleted.", redirectTo: "/admin/redirects?notice=deleted" };
  });
}
