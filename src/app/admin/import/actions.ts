"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { ValidationError } from "@/core/errors";
import { assertEntity, preview, run } from "@/modules/imports/service";
import { MAX_IMPORT_BYTES, type ImportPreview, type ImportResult } from "@/modules/imports/types";
import { runDataAction, type DataResult } from "@/shared/admin/action-helpers";

export type WizardState = { kind: "preview"; preview: ImportPreview } | { kind: "done"; result: ImportResult };

/** Reads the mapping the wizard posts as JSON: { fieldName: "file header" }. Anything else is ignored. */
function readMapping(value: FormDataEntryValue | null): Record<string, unknown> | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * One action for both steps. intent=preview checks the whole file and reports what an import would do (nothing is
 * written). intent=run imports it. Both read the file again, so the preview and the import always judge the same file.
 */
export async function importWizardAction(_prev: DataResult<WizardState> | null, formData: FormData): Promise<DataResult<WizardState>> {
  return runDataAction(async () => {
    const session = await requirePermission(P.importRun);
    const entity = assertEntity(String(formData.get("entity") ?? ""));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("No file", { file: "Choose a CSV file." });
    if (file.size > MAX_IMPORT_BYTES) throw new ValidationError("File too large", { file: `The file is larger than ${MAX_IMPORT_BYTES / 1_000_000} MB. Split it into smaller files.` });
    const input = { text: await file.text(), filename: file.name.slice(0, 120), mapping: readMapping(formData.get("mapping")) };
    if (formData.get("intent") === "run") return { kind: "done", result: await run(entity, input, session.user.id) } as const;
    return { kind: "preview", preview: await preview(entity, input) } as const;
  });
}
