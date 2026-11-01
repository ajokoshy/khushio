import { safeHref } from "./markdown";
export const MENUS = ["header", "footer"] as const;
export type Menu = (typeof MENUS)[number];
export type NavLink = { label: string; href: string; newTab: boolean };

/** Menu links may point to a site path or an https address; anything else is refused. */
export function cleanNavItem(label: string, href: string): { ok: true; label: string; href: string } | { ok: false; reason: "label" | "href" } {
  const l = label.trim().replace(/\s+/g, " "), h = href.trim();
  if (!l || l.length > 40) return { ok: false, reason: "label" };
  if (!safeHref(h)) return { ok: false, reason: "href" };
  return { ok: true, label: l, href: h };
}
