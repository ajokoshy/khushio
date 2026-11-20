export const NAV_AREAS = ["header", "footer"] as const;
export type NavArea = (typeof NAV_AREAS)[number];
export const NAV_AREA_LABELS: Record<NavArea, string> = { header: "Header menu", footer: "Footer links" };
/** How many links an area can hold: the header has room for a few, the footer for more. */
export const NAV_LIMITS: Record<NavArea, number> = { header: 8, footer: 20 };

export type NavItem = { id: string; area: NavArea; label: string; href: string; sortOrder: number; isActive: boolean };
export type NavLink = { label: string; href: string };
export type NavWrite = { area: NavArea; label: string; href: string; isActive: boolean };
