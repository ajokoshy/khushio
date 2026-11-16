"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { ValidationError } from "@/core/errors";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/conversions/service";
import { MAX_IMPORT_BYTES } from "@/modules/conversions/rows";
import type { ImportSummary } from "@/modules/conversions/types";
import { conversionInputSchema, idSchema, importFormSchema } from "@/modules/conversions/validation";
import { invalidForm, runAction, runDataAction, runFormAction, stringValues, type DataResult, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createConversionAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const parsed = conversionInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createConversion(parsed.data, session.user.id);
    return { redirectTo: "/admin/conversions?notice=created" };
  });
}

export async function updateConversionAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That conversion does not exist.", values: stringValues(raw) };
    const parsed = conversionInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateConversion(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/conversions?notice=updated" };
  });
}

export async function deleteConversionAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That conversion does not exist." };
    await service.deleteConversion(entityId.data, session.user.id);
    return { ok: true, message: "Conversion deleted.", redirectTo: "/admin/conversions?notice=deleted" };
  });
}

/** Reads the uploaded CSV as text (at most 1 MB) and imports it. The summary is shown on the same page. */
export async function importConversionsAction(_prev: DataResult<ImportSummary> | null, formData: FormData): Promise<DataResult<ImportSummary>> {
  return runDataAction(async () => {
    const session = await requirePermission(P.importRun);
    const parsed = importFormSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ValidationError("Invalid form", { [String(first?.path[0] ?? "networkId")]: first?.message ?? "Check the form." });
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("No file", { file: "Choose a CSV file." });
    if (file.size > MAX_IMPORT_BYTES) throw new ValidationError("File too large", { file: "The file is larger than 1 MB. Split it into smaller files." });
    return service.importConversions({ csvText: await file.text(), filename: file.name, networkId: parsed.data.networkId, currency: parsed.data.currency }, session.user.id);
  });
}
