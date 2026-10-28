import { db, schema } from "@/lib/db";
export const SETTING_DEFAULTS = {
  hero_title: "Discover More.\nSave More.\nLive Happier.",
  hero_subtitle: "From everyday essentials to special moments, find the best products, deals and brands, all in one place.",
  search_placeholder: "Search for products, brands, deals and more...",
  announcement: "",
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;
export async function getSettings(): Promise<Record<SettingKey, string>> {
  const out: Record<SettingKey, string> = { ...SETTING_DEFAULTS };
  if (!db) return out;
  try { for (const r of await db.select().from(schema.siteSettings)) if (r.key in out && r.value) out[r.key as SettingKey] = r.value; } catch {}
  return out;
}
