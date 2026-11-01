import { cached } from "@/lib/cache";
import { db, schema } from "@/lib/db";
import { SETTING_DEFAULTS, SETTING_KEYS, type SettingKey } from "@/lib/settings-schema";
export { SETTING_DEFAULTS, SETTINGS, type SettingKey } from "@/lib/settings-schema";

const readSettings = cached(async (): Promise<Record<SettingKey, string>> => {
  const out: Record<SettingKey, string> = { ...SETTING_DEFAULTS };
  if (!db) return out;
  for (const r of await db.select().from(schema.siteSettings)) if ((SETTING_KEYS as string[]).includes(r.key) && r.value) out[r.key as SettingKey] = r.value;
  return out;
}, "settings", ["settings"], 21600);
/** Cached under the "settings" tag. If the database is unreachable the defaults are used for this request only (never cached). */
export async function getSettings(): Promise<Record<SettingKey, string>> {
  try { return await readSettings(); } catch { return { ...SETTING_DEFAULTS }; }
}
