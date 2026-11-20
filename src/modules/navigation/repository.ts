import { and, asc, count, eq, max } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { navigationItems } from "@/core/database/schema";
import { NAV_AREAS, type NavArea, type NavItem, type NavWrite } from "./types";

/** Repository: the only code in this module that talks to the database. */

const columns = { id: navigationItems.id, area: navigationItems.area, label: navigationItems.label, href: navigationItems.href, sortOrder: navigationItems.sortOrder, isActive: navigationItems.isActive };
const known = (rows: { area: string }[]) => rows.filter((r) => (NAV_AREAS as readonly string[]).includes(r.area)) as NavItem[];
const order = [asc(navigationItems.sortOrder), asc(navigationItems.label), asc(navigationItems.id)] as const;

export async function selectItems(area?: NavArea): Promise<NavItem[]> {
  return known(await db().select(columns).from(navigationItems).where(area ? eq(navigationItems.area, area) : undefined).orderBy(asc(navigationItems.area), ...order));
}

export async function selectActiveItems(area: NavArea): Promise<NavItem[]> {
  return known(await db().select(columns).from(navigationItems).where(and(eq(navigationItems.area, area), eq(navigationItems.isActive, true))).orderBy(...order));
}

export async function selectItemById(id: string): Promise<NavItem | null> {
  const [row] = await db().select(columns).from(navigationItems).where(eq(navigationItems.id, id)).limit(1);
  return row ? (known([row])[0] ?? null) : null;
}

export async function countItems(area: NavArea): Promise<number> {
  const [row] = await db().select({ n: count() }).from(navigationItems).where(eq(navigationItems.area, area));
  return Number(row?.n ?? 0);
}

export async function selectMaxSortOrder(area: NavArea): Promise<number> {
  const [row] = await db().select({ m: max(navigationItems.sortOrder) }).from(navigationItems).where(eq(navigationItems.area, area));
  return row?.m ?? -1;
}

export async function insertItem(values: NavWrite & { sortOrder: number }): Promise<string> {
  const [row] = await db().insert(navigationItems).values(values).returning({ id: navigationItems.id });
  return (row as { id: string }).id;
}

export async function updateItemRow(id: string, values: Omit<NavWrite, "area">): Promise<void> {
  await db().update(navigationItems).set(values).where(eq(navigationItems.id, id));
}

export async function deleteItemRow(id: string): Promise<void> {
  await db().delete(navigationItems).where(eq(navigationItems.id, id));
}

export async function setItemOrder(orderedIds: readonly string[]): Promise<void> {
  await runAtomically((d) => orderedIds.map((id, index) => d.update(navigationItems).set({ sortOrder: index }).where(eq(navigationItems.id, id))));
}
