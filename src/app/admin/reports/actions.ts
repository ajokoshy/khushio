"use server";

import { z } from "zod";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject, intField } from "@/core/validation/fields";
import { runDailyMaintenance, setRetentionDays } from "@/modules/reports/rollup";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from "@/modules/reports/settings";
import { invalidForm, runAction, runFormAction, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

const retentionSchema = z.object({ retentionDays: intField(MIN_RETENTION_DAYS, MAX_RETENTION_DAYS, 30) });

/** Changes a setting that deletes data, so the permission is re-read from the database (fresh), not from the session token. */
export async function updateRetentionAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.settingsManage, { fresh: true });
    const parsed = retentionSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await setRetentionDays(parsed.data.retentionDays, session.user.id);
    return { redirectTo: "/admin/reports?notice=updated" };
  });
}

/** The same job the daily cron runs, for the first deployment check or after a missed night. Safe to repeat. */
export async function runRollupAction(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.settingsManage, { fresh: true });
    const r = await runDailyMaintenance(new Date(), session.user.id);
    return { ok: true, message: `Done. ${r.daysWritten} link-day total${r.daysWritten === 1 ? "" : "s"} written, ${r.clicksPurged} old raw click${r.clicksPurged === 1 ? "" : "s"} removed (kept ${r.retentionDays} days).` };
  });
}
