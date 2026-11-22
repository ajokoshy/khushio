"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import { saveOverride } from "@/modules/seo/service";
import { idSchema, overrideTypeSchema, seoOverrideSchema } from "@/modules/seo/validation";
import { isOverrideType } from "@/modules/seo/types";
import { invalidForm, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { FormState } from "@/shared/admin/form-state";

export async function saveSeoAction(type: string, id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.seoWrite);
    const entityId = idSchema.safeParse(id);
    if (!overrideTypeSchema.safeParse(type).success || !isOverrideType(type) || !entityId.success) return { ok: false, error: "That page does not exist.", values: stringValues(raw) };
    const parsed = seoOverrideSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await saveOverride(type, entityId.data, parsed.data, session.user.id);
    return { redirectTo: `/admin/seo?type=${type}&notice=updated` };
  });
}
