import { eq } from "drizzle-orm";
import { db } from "@/core/database/client";
import { siteSettings } from "@/core/database/schema";

/** Release 4B settings kept in site_settings. */
export const RETENTION_KEY = "affiliate.click_retention_days";
export const DEFAULT_RETENTION_DAYS = 30;
/** At least a week, so the daily job's catch-up window always lies inside the data that is kept. */
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 365;

/** Anything that is not a whole number in range (missing row, text, a hand-edited value) falls back to the default. */
export function normaliseRetention(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_RETENTION_DAYS && value <= MAX_RETENTION_DAYS ? value : DEFAULT_RETENTION_DAYS;
}

export async function readRetentionDays(): Promise<number> {
  const [row] = await db().select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, RETENTION_KEY)).limit(1);
  return normaliseRetention(row?.value);
}

export async function writeRetentionDays(days: number): Promise<void> {
  await db()
    .insert(siteSettings)
    .values({ key: RETENTION_KEY, value: days })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: days } });
}
