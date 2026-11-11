import { hasPermission, PERMISSIONS as P, type PermissionKey } from "@/core/permissions";

export type AdminNavIcon = "dashboard" | "audit";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: AdminNavIcon;
  /** The link is hidden unless the user holds this permission. The page itself still checks it. */
  permission: PermissionKey;
};

/**
 * The single source for admin navigation. Later phases add one entry per admin screen they ship
 * (and one icon in src/shared/layouts/admin-nav.tsx); nothing else changes.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard", permission: P.dashboardView },
  { label: "Audit log", href: "/admin/audit", icon: "audit", permission: P.auditView },
];

export function visibleAdminNav(granted: readonly string[] | null | undefined): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => hasPermission(granted, item.permission));
}
