import { asc, count, eq, max } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { homepageSections } from "@/core/database/schema";
import { isSectionType } from "./config";
import type { SectionRow, SectionWrite } from "./types";

/** Repository: the only code in this module that talks to the database. */

const columns = {
  id: homepageSections.id,
  type: homepageSections.type,
  heading: homepageSections.heading,
  config: homepageSections.config,
  sortOrder: homepageSections.sortOrder,
  isEnabled: homepageSections.isEnabled,
  publishAt: homepageSections.publishAt,
  createdAt: homepageSections.createdAt,
};

/** A row whose type this code does not know (written by hand or by a later release) is left out instead of breaking the page. */
const known = (rows: { type: string }[]) => rows.filter((r): r is typeof r & { type: SectionRow["type"] } => isSectionType(r.type));

const order = [asc(homepageSections.sortOrder), asc(homepageSections.createdAt), asc(homepageSections.id)] as const;

/** Every section, in page order. The table is small (MAX_SECTIONS), one query. Uses home_sections_order_idx. */
export async function selectSections(): Promise<SectionRow[]> {
  return known(await db().select(columns).from(homepageSections).orderBy(...order)) as SectionRow[];
}

/** The sections a visitor could see: switched on. The caller applies the go-live time with the clock at call time. */
export async function selectEnabledSections(): Promise<SectionRow[]> {
  return known(await db().select(columns).from(homepageSections).where(eq(homepageSections.isEnabled, true)).orderBy(...order)) as SectionRow[];
}

export async function selectSectionById(id: string): Promise<SectionRow | null> {
  const [row] = await db().select(columns).from(homepageSections).where(eq(homepageSections.id, id)).limit(1);
  return row && known([row]).length === 1 ? (row as SectionRow) : null;
}

export async function countSections(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(homepageSections);
  return Number(row?.n ?? 0);
}

export async function selectMaxSortOrder(): Promise<number> {
  const [row] = await db().select({ m: max(homepageSections.sortOrder) }).from(homepageSections);
  return row?.m ?? -1;
}

export async function insertSection(values: SectionWrite & { sortOrder: number }): Promise<string> {
  const [row] = await db().insert(homepageSections).values(values).returning({ id: homepageSections.id });
  return (row as { id: string }).id;
}

/** Several sections in one all-or-nothing write (the starter layout). */
export async function insertSections(rows: readonly (SectionWrite & { sortOrder: number })[]): Promise<void> {
  if (rows.length === 0) return;
  await runAtomically((d) => [d.insert(homepageSections).values([...rows])]);
}

export async function updateSectionRow(id: string, values: Omit<SectionWrite, "type">): Promise<void> {
  await db().update(homepageSections).set(values).where(eq(homepageSections.id, id));
}

export async function setSectionEnabled(id: string, isEnabled: boolean): Promise<void> {
  await db().update(homepageSections).set({ isEnabled }).where(eq(homepageSections.id, id));
}

export async function deleteSectionRow(id: string): Promise<void> {
  await db().delete(homepageSections).where(eq(homepageSections.id, id));
}

/** Writes sort_order 0, 1, 2 ... in the given order, all together: the page order is never half-saved. */
export async function setSectionOrder(orderedIds: readonly string[]): Promise<void> {
  await runAtomically((d) => orderedIds.map((id, index) => d.update(homepageSections).set({ sortOrder: index }).where(eq(homepageSections.id, id))));
}
