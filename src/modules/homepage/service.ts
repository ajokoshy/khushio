import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import * as catalog from "@/modules/catalog/service";
import { getLatestGuides } from "@/modules/content/public";
import { GUIDE_TYPES, isArticleType } from "@/modules/content/types";
import { getDealsPage } from "@/modules/deals/public";
import * as discover from "@/modules/discover/service";
import { isSectionType, MAX_SECTIONS, parseSectionConfig, STARTING_CONFIG, type SectionType } from "./config";
import * as repo from "./repository";
import type { PreviewSection, ResolvedSection, SectionRow, SectionState, SectionWrite } from "./types";
import type { SectionInput } from "./validation";

/**
 * The homepage builder (Release 6B). Admin writes: validated input, per-type config check, one write, an audit row, and
 * the tag `homepage` plus the home page itself are refreshed at once. Public reads: the section list is cached for
 * CACHE_TTL.homepage (10 minutes) under the tag `homepage`; a section's go-live time is checked with the clock at call time,
 * so a scheduled section needs no job. Each section reads its data from a cached reader of its own module (products, deals,
 * articles, categories), so the page costs a small fixed number of queries however busy the site is.
 */

const touch = () => {
  revalidateTag(CACHE_TAGS.homepage);
  revalidatePath("/");
};

/** Live = switched on and its go-live time (if any) has passed. */
export function sectionState(section: Pick<SectionRow, "isEnabled" | "publishAt">, now: Date = new Date()): SectionState {
  if (!section.isEnabled) return "off";
  if (section.publishAt && section.publishAt.getTime() > now.getTime()) return "scheduled";
  return "live";
}

/* ================================== admin ================================== */

export const listSections = () => repo.selectSections();

export async function getSection(id: string): Promise<SectionRow> {
  const row = await repo.selectSectionById(id);
  if (!row) throw new NotFoundError("Section not found");
  return row;
}

function checkConfig(type: SectionType, raw: unknown): unknown {
  const result = parseSectionConfig(type, raw);
  if (!result.ok) throw new ValidationError("Invalid section", result.fields);
  return result.config;
}

export async function createSection(input: SectionInput, rawConfig: unknown, actorId: string): Promise<string> {
  if ((await repo.countSections()) >= MAX_SECTIONS) throw new ConflictError(`The homepage can have at most ${MAX_SECTIONS} sections. Delete one first.`);
  const config = checkConfig(input.type, rawConfig);
  const id = await repo.insertSection({ type: input.type, heading: input.heading, config, isEnabled: input.isEnabled, publishAt: input.publishAt, sortOrder: (await repo.selectMaxSortOrder()) + 1 });
  await logAuditBestEffort({ actor: actorId, action: "homepage_section.created", entityType: "homepage_section", entityId: id, metadata: { type: input.type, enabled: input.isEnabled } });
  touch();
  return id;
}

/** The type of a section never changes: delete it and add another instead. */
export async function updateSection(id: string, input: SectionInput, rawConfig: unknown, actorId: string): Promise<void> {
  const current = await getSection(id);
  const config = checkConfig(current.type, rawConfig);
  const next: Omit<SectionWrite, "type"> = { heading: input.heading, config, isEnabled: input.isEnabled, publishAt: input.publishAt };
  const changed: string[] = [];
  if (next.heading !== current.heading) changed.push("heading");
  if (JSON.stringify(next.config) !== JSON.stringify(current.config)) changed.push("config");
  if (next.isEnabled !== current.isEnabled) changed.push("enabled");
  if ((next.publishAt?.getTime() ?? null) !== (current.publishAt?.getTime() ?? null)) changed.push("publishAt");
  if (changed.length === 0) return;
  await repo.updateSectionRow(id, next);
  await logAuditBestEffort({ actor: actorId, action: "homepage_section.updated", entityType: "homepage_section", entityId: id, metadata: { type: current.type, changed } });
  touch();
}

export async function setEnabled(id: string, isEnabled: boolean, actorId: string): Promise<void> {
  const current = await getSection(id);
  if (current.isEnabled === isEnabled) return;
  await repo.setSectionEnabled(id, isEnabled);
  await logAuditBestEffort({ actor: actorId, action: isEnabled ? "homepage_section.enabled" : "homepage_section.disabled", entityType: "homepage_section", entityId: id, metadata: { type: current.type } });
  touch();
}

export async function deleteSection(id: string, actorId: string): Promise<void> {
  const current = await getSection(id);
  await repo.deleteSectionRow(id);
  await logAuditBestEffort({ actor: actorId, action: "homepage_section.deleted", entityType: "homepage_section", entityId: id, metadata: { type: current.type, heading: current.heading } });
  touch();
}

/** Swaps a section with its neighbour and rewrites the whole order (0, 1, 2 ...) in one atomic write. A move past either end does nothing. */
export async function moveSection(id: string, direction: "up" | "down", actorId: string): Promise<void> {
  const ids = (await repo.selectSections()).map((s) => s.id);
  const from = ids.indexOf(id);
  if (from === -1) throw new NotFoundError("Section not found");
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
  await repo.setSectionOrder(ids);
  await logAuditBestEffort({ actor: actorId, action: "homepage_section.moved", entityType: "homepage_section", entityId: id, metadata: { direction } });
  touch();
}

/** The layout a new site starts from: brand banner, categories, trending products, deals and guides. Only when there are no sections yet. */
export async function createStarterLayout(actorId: string): Promise<number> {
  if ((await repo.countSections()) > 0) throw new ConflictError("The homepage already has sections. The starter layout is only for an empty homepage.");
  const make = (type: SectionType, heading: string | null): SectionWrite => ({ type, heading, config: checkConfig(type, STARTING_CONFIG[type]), isEnabled: true, publishAt: null });
  const rows = [
    make("hero_banner", null),
    make("featured_categories", "Shop by category"),
    make("trending_products", "Trending now"),
    make("deals", "Deals and coupons"),
    make("guides", "Guides and reviews"),
  ].map((r, sortOrder) => ({ ...r, sortOrder }));
  await repo.insertSections(rows);
  await logAuditBestEffort({ actor: actorId, action: "homepage_section.starter_created", entityType: "homepage_section", entityId: null, metadata: { sections: rows.length } });
  touch();
  return rows.length;
}

/** The "refresh now" button: nothing is changed, only the cached homepage is rebuilt on the next visit. */
export async function refreshHomepage(actorId: string): Promise<void> {
  touch();
  await logAuditBestEffort({ actor: actorId, action: "homepage.refreshed", entityType: "homepage", entityId: null, metadata: {} });
}

/* ================================== public ================================== */

const cachedEnabled = unstable_cache(() => repo.selectEnabledSections(), ["homepage-sections"], { revalidate: CACHE_TTL.homepage, tags: [CACHE_TAGS.homepage] });

type Revivable = Omit<SectionRow, "publishAt" | "createdAt"> & { publishAt: Date | string | null; createdAt: Date | string };
const revive = (r: Revivable): SectionRow => ({ ...r, publishAt: r.publishAt ? new Date(r.publishAt) : null, createdAt: new Date(r.createdAt) });

/** Loads the data a section needs. Null: nothing to show (no products, no offers ...) or the stored config is not valid. */
export async function resolveSection(row: SectionRow): Promise<ResolvedSection | null> {
  if (!isSectionType(row.type)) return null;
  const base = { id: row.id, heading: row.heading };
  switch (row.type) {
    case "hero_banner": {
      const r = parseSectionConfig("hero_banner", row.config);
      return r.ok ? { ...base, type: "hero_banner", config: r.config } : null;
    }
    case "promo_banner": {
      const r = parseSectionConfig("promo_banner", row.config);
      return r.ok ? { ...base, type: "promo_banner", config: r.config } : null;
    }
    case "featured_categories": {
      const r = parseSectionConfig("featured_categories", row.config);
      if (!r.ok) return null;
      const wanted = r.config.categoryIds;
      const found = wanted.length === 0 ? (await discover.listTopCategories()).slice(0, 8) : await discover.findCategoriesByIds(wanted);
      const active = found.filter((c) => c.isActive);
      const ordered = wanted.length === 0 ? active : wanted.flatMap((id) => active.find((c) => c.id === id) ?? []);
      return ordered.length > 0 ? { ...base, type: "featured_categories", categories: ordered.map((c) => ({ slug: c.slug, name: c.name, description: c.description })) } : null;
    }
    case "trending_products": {
      const r = parseSectionConfig("trending_products", row.config);
      if (!r.ok) return null;
      const cards = await catalog.getTrendingProducts(r.config.mode, r.config.limit);
      return cards.length > 0 ? { ...base, type: "trending_products", cards } : null;
    }
    case "deals": {
      const r = parseSectionConfig("deals", row.config);
      if (!r.ok) return null;
      const deals = (await getDealsPage()).deals.slice(0, r.config.limit);
      return deals.length > 0 ? { ...base, type: "deals", deals } : null;
    }
    case "collections": {
      const r = parseSectionConfig("collections", row.config);
      if (!r.ok) return null;
      const tiles = await catalog.getCollectionTiles(r.config.collectionIds);
      return tiles.length > 0 ? { ...base, type: "collections", tiles, config: r.config } : null;
    }
    case "guides": {
      const r = parseSectionConfig("guides", row.config);
      if (!r.ok) return null;
      const chosen = r.config.types.filter(isArticleType);
      const articles = await getLatestGuides(chosen.length > 0 ? chosen : GUIDE_TYPES, r.config.limit);
      return articles.length > 0 ? { ...base, type: "guides", articles, config: r.config } : null;
    }
  }
}

/** A section that fails to load is logged and skipped: one broken section must not take the whole homepage down. */
async function resolveSafely(row: SectionRow): Promise<ResolvedSection | null> {
  try {
    return await resolveSection(row);
  } catch (error) {
    console.error(`Homepage section ${row.type} (${row.id}) failed to load`, error);
    return null;
  }
}

/** What visitors see: live sections in page order, with their data. Sections with nothing to show are left out. */
export async function getHomepage(now: Date = new Date()): Promise<ResolvedSection[]> {
  const rows = (await cachedEnabled()).map(revive).filter((r) => sectionState(r, now) === "live");
  return (await Promise.all(rows.map(resolveSafely))).filter((s): s is ResolvedSection => s !== null);
}

/** The preview: every section, switched off or not yet live included, each with its state. Never cached. */
export async function getHomepagePreview(now: Date = new Date()): Promise<PreviewSection[]> {
  const rows = await repo.selectSections();
  return Promise.all(
    rows.map(async (row): Promise<PreviewSection> => {
      const valid = parseSectionConfig(row.type, row.config).ok;
      const section = valid ? await resolveSafely(row) : null;
      const problem = !valid ? "The saved settings are not valid. Open the section and save it again." : section === null ? "Nothing to show yet, so visitors will not see this section." : null;
      return { id: row.id, type: row.type, heading: row.heading, state: sectionState(row, now), publishAt: row.publishAt, section, problem };
    }),
  );
}
