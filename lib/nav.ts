import { asc, eq } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { enabled, legalLinks, nav } from "@/lib/config/site";
import { db, schema } from "@/lib/db";
import type { Menu, NavLink } from "@/lib/nav-core";

export const defaultMenu = (menu: Menu): NavLink[] => enabled(menu === "header" ? nav : legalLinks).map((i) => ({ label: i.label, href: i.href, newTab: false }));

/** Custom menu rows (id and flags included) for the admin screen. Empty means the built-in default is in use. */
export async function loadMenuRows(menu: Menu) {
  if (!db) return [];
  return db.select().from(schema.navItems).where(eq(schema.navItems.menu, menu)).orderBy(asc(schema.navItems.position), asc(schema.navItems.label));
}

/** A menu for visitors: enabled custom items if any were saved, otherwise the built-in default. Cached under the "nav" tag. */
export const getNav = cached(async (menu: Menu): Promise<NavLink[]> => {
  if (!db) return defaultMenu(menu);
  const rows = await db.select().from(schema.navItems).where(eq(schema.navItems.menu, menu)).orderBy(asc(schema.navItems.position));
  return rows.length ? rows.filter((r) => r.enabled).map((r) => ({ label: r.label, href: r.href, newTab: r.newTab })) : defaultMenu(menu);
}, "nav", ["nav"], 21600);
