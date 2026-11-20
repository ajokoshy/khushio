import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import { ConflictError, NotFoundError } from "@/core/errors";
import { NAV } from "@/shared/constants/site";
import * as repo from "./repository";
import { NAV_AREA_LABELS, NAV_LIMITS, type NavArea, type NavItem, type NavLink } from "./types";
import type { NavItemInput } from "./validation";

/**
 * The header menu and footer links (Release 6B), stored in navigation_items and edited under /admin/navigation.
 * Every write clears the tag `navigation`, so a change shows at once; reads are cached for CACHE_TTL.navigation.
 * With no active link in the header the built-in menu (src/shared/constants/site.ts) is used, so the site always has a menu
 * even before anyone sets one up or while the database is unreachable.
 */

const touch = () => {
  revalidateTag(CACHE_TAGS.navigation);
  revalidatePath("/", "layout");
};

export const listItems = () => repo.selectItems();

export async function getItem(id: string): Promise<NavItem> {
  const row = await repo.selectItemById(id);
  if (!row) throw new NotFoundError("Link not found");
  return row;
}

export async function createItem(input: NavItemInput, actorId: string): Promise<string> {
  if ((await repo.countItems(input.area)) >= NAV_LIMITS[input.area]) throw new ConflictError(`${NAV_AREA_LABELS[input.area]} can hold at most ${NAV_LIMITS[input.area]} links. Delete one first.`);
  const id = await repo.insertItem({ area: input.area, label: input.label, href: input.href, isActive: input.isActive, sortOrder: (await repo.selectMaxSortOrder(input.area)) + 1 });
  await logAuditBestEffort({ actor: actorId, action: "navigation.created", entityType: "navigation_item", entityId: id, metadata: { area: input.area, label: input.label } });
  touch();
  return id;
}

/** The area of a link never changes: delete it and add another instead. */
export async function updateItem(id: string, input: NavItemInput, actorId: string): Promise<void> {
  const current = await getItem(id);
  if (current.label === input.label && current.href === input.href && current.isActive === input.isActive) return;
  await repo.updateItemRow(id, { label: input.label, href: input.href, isActive: input.isActive });
  await logAuditBestEffort({ actor: actorId, action: "navigation.updated", entityType: "navigation_item", entityId: id, metadata: { area: current.area } });
  touch();
}

export async function setActive(id: string, isActive: boolean, actorId: string): Promise<void> {
  const current = await getItem(id);
  if (current.isActive === isActive) return;
  await repo.updateItemRow(id, { label: current.label, href: current.href, isActive });
  await logAuditBestEffort({ actor: actorId, action: isActive ? "navigation.enabled" : "navigation.disabled", entityType: "navigation_item", entityId: id, metadata: { area: current.area } });
  touch();
}

export async function deleteItem(id: string, actorId: string): Promise<void> {
  const current = await getItem(id);
  await repo.deleteItemRow(id);
  await logAuditBestEffort({ actor: actorId, action: "navigation.deleted", entityType: "navigation_item", entityId: id, metadata: { area: current.area, label: current.label } });
  touch();
}

/** Swaps a link with its neighbour in the same area and rewrites that area's order in one atomic write. */
export async function moveItem(id: string, direction: "up" | "down", actorId: string): Promise<void> {
  const current = await getItem(id);
  const ids = (await repo.selectItems(current.area)).map((i) => i.id);
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
  await repo.setItemOrder(ids);
  await logAuditBestEffort({ actor: actorId, action: "navigation.moved", entityType: "navigation_item", entityId: id, metadata: { area: current.area, direction } });
  touch();
}

/* ================================== public ================================== */

const cachedActive = unstable_cache((area: NavArea) => repo.selectActiveItems(area), ["navigation-active"], { revalidate: CACHE_TTL.navigation, tags: [CACHE_TAGS.navigation] });

/** The links to show for an area. An empty header falls back to the built-in menu; an empty footer has no extra links. A read failure uses the same fallbacks. */
export async function getNavigation(area: NavArea): Promise<NavLink[]> {
  const fallback: NavLink[] = area === "header" ? NAV.map((n) => ({ label: n.label, href: n.href })) : [];
  try {
    const items = await cachedActive(area);
    return items.length > 0 ? items.map((i) => ({ label: i.label, href: i.href })) : fallback;
  } catch (error) {
    console.error("Navigation unavailable, using the built-in links", error);
    return fallback;
  }
}
