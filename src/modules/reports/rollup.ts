import { logAuditBestEffort } from "@/core/audit";
import { ValidationError } from "@/core/errors";
import { DAY_MS, istDayStart } from "./days";
import * as repo from "./rollup-repository";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, readRetentionDays, writeRetentionDays } from "./settings";

/**
 * The daily maintenance job (Release 4B), called by the protected cron route and by the "Run now" button:
 *   1. ROLL UP: count human clicks per link and IST day into affiliate_click_daily (upsert, never lowers a total).
 *   2. PURGE: delete raw clicks older than the retention setting.
 * Roll-up always comes first, and it always covers every day that the purge is about to delete, so a click is never
 * deleted before it has been counted. Only COMPLETE days are rolled up (today is still collecting clicks).
 */

/** Days before today that every run recounts, so a missed night or a late manual run heals itself. */
export const ROLLUP_LOOKBACK_DAYS = 7;

export type MaintenanceResult = {
  retentionDays: number;
  /** The rolled-up window: from (included) to (excluded), as instants. */
  from: string;
  to: string;
  daysWritten: number;
  clicksPurged: number;
};

export async function runDailyMaintenance(now: Date = new Date(), actorId: string | null = null): Promise<MaintenanceResult> {
  const retentionDays = await readRetentionDays();
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const today = istDayStart(now);

  // Recount the last week, and anything older that this run is about to purge (for example after the retention was shortened).
  let from = new Date(today.getTime() - ROLLUP_LOOKBACK_DAYS * DAY_MS);
  const oldest = await repo.selectOldestClickAt();
  if (oldest && oldest < cutoff) {
    const oldestDay = istDayStart(oldest);
    if (oldestDay < from) from = oldestDay;
  }

  const daysWritten = await repo.upsertDailyClicks(from, today);
  const clicksPurged = await repo.deleteClicksBefore(cutoff);

  const result: MaintenanceResult = { retentionDays, from: from.toISOString(), to: today.toISOString(), daysWritten, clicksPurged };
  await logAuditBestEffort({ actor: actorId, action: "affiliate.rollup_run", entityType: "affiliate_clicks", metadata: { ...result } });
  return result;
}

export async function getRetentionDays(): Promise<number> {
  return readRetentionDays();
}

export async function setRetentionDays(days: number, actorId: string): Promise<void> {
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    throw new ValidationError("Invalid retention", { retentionDays: `Enter a whole number of days between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}.` });
  }
  const before = await readRetentionDays();
  if (before === days) return;
  await writeRetentionDays(days);
  await logAuditBestEffort({ actor: actorId, action: "settings.click_retention_updated", entityType: "site_settings", metadata: { from: before, to: days } });
}
