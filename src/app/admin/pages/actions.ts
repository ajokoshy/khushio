"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/content/service";
import { idSchema, pageInputSchema } from "@/modules/content/validation";
import { invalidForm, runAction, runFormAction, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";
import { whoOf } from "@/shared/admin/content/who";

export async function createPageAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.contentWrite);
    const parsed = pageInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createPage(parsed.data, whoOf(session));
    return { redirectTo: "/admin/pages?notice=created" };
  });
}

export async function updatePageAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.contentWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That page does not exist.", values: {} };
    const parsed = pageInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updatePage(entityId.data, parsed.data, whoOf(session));
    return { redirectTo: "/admin/pages?notice=updated" };
  });
}

export async function deletePageAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.contentWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That page does not exist." };
    await service.deletePage(entityId.data, whoOf(session));
    return { ok: true, message: "Page deleted.", redirectTo: "/admin/pages?notice=deleted" };
  });
}
