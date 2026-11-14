import { hasPermission, PERMISSIONS as P, type PermissionKey } from "@/core/permissions";

export type AdminNavIcon = "dashboard" | "audit" | "categories" | "brands" | "merchants" | "products" | "media";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: AdminNavIcon;
  /** The link is hidden unless the user holds this permission. The page itself still checks it. */
  permission: PermissionKey;
};

/**
 * The single source for admin navigation. Later phases add one entry per admin screen they ship
 * (and one icon in src/shared/layouts/admin-frame.tsx); nothing else changes.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard", permission: P.dashboardView },
  { label: "Products", href: "/admin/products", icon: "products", permission: P.productRead },
  { label: "Media", href: "/admin/media", icon: "media", permission: P.mediaWrite },
  { label: "Categories", href: "/admin/categories", icon: "categories", permission: P.categoryWrite },
  { label: "Brands", href: "/admin/brands", icon: "brands", permission: P.brandWrite },
  { label: "Merchants", href: "/admin/merchants", icon: "merchants", permission: P.merchantWrite },
  { label: "Audit log", href: "/admin/audit", icon: "audit", permission: P.auditView },
];

export function visibleAdminNav(granted: readonly string[] | null | undefined): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => hasPermission(granted, item.permission));
}
