import { asc } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { db, schema } from "@/lib/db";
import { DEFAULT_LAYOUT, isSectionType, type Config, type SectionType } from "@/lib/home/sections";

export type HomeSection = { id: string; type: SectionType; position: number; enabled: boolean; publishAt: string | null; unpublishAt: string | null; config: Config; stored: boolean };

/** Stored sections in order, or the built-in layout when none are stored (no storage used until someone customises it). Cached under the "home" tag. */
export const loadHomeSections = cached(async (): Promise<HomeSection[]> => {
  const rows = db ? await db.select().from(schema.homeSections).orderBy(asc(schema.homeSections.position), asc(schema.homeSections.id)) : [];
  if (!rows.length) return DEFAULT_LAYOUT.map((s, i) => ({ id: `default-${i}`, type: s.type, position: i, enabled: true, publishAt: null, unpublishAt: null, config: s.config, stored: false }));
  return rows.filter((r) => isSectionType(r.type)).map((r) => ({ id: r.id, type: r.type as SectionType, position: r.position, enabled: r.enabled, publishAt: r.publishAt?.toISOString() ?? null, unpublishAt: r.unpublishAt?.toISOString() ?? null, config: (r.config ?? {}) as Config, stored: true }));
}, "home-sections", ["home"], 1800);
