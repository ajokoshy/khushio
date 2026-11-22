import { hasPermission, PERMISSIONS as P, type PermissionKey } from "@/core/permissions";

export type AdminNavIcon = "dashboard" | "audit" | "categories" | "brands" | "merchants" | "products" | "media" | "links" | "networks" | "programs" | "reports" | "conversions" | "deals" | "coupons" | "import" | "articles" | "pages" | "authors" | "topics" | "homepage" | "navigation" | "redirects" | "seo" | "launch";

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
  { label: "Affiliate links", href: "/admin/links", icon: "links", permission: P.affiliateRead },
  { label: "Networks", href: "/admin/networks", icon: "networks", permission: P.affiliateRead },
  { label: "Programmes", href: "/admin/programs", icon: "programs", permission: P.affiliateRead },
  { label: "Deals", href: "/admin/deals", icon: "deals", permission: P.dealWrite },
  { label: "Coupons", href: "/admin/coupons", icon: "coupons", permission: P.dealWrite },
  { label: "Articles and guides", href: "/admin/articles", icon: "articles", permission: P.contentWrite },
  { label: "Pages", href: "/admin/pages", icon: "pages", permission: P.contentWrite },
  { label: "Authors", href: "/admin/authors", icon: "authors", permission: P.contentWrite },
  { label: "Topics and tags", href: "/admin/topics", icon: "topics", permission: P.contentWrite },
  { label: "Homepage", href: "/admin/homepage", icon: "homepage", permission: P.homepageWrite },
  { label: "Navigation", href: "/admin/navigation", icon: "navigation", permission: P.homepageWrite },
  { label: "Search (SEO)", href: "/admin/seo", icon: "seo", permission: P.seoWrite },
  { label: "Redirects", href: "/admin/redirects", icon: "redirects", permission: P.seoWrite },
  { label: "Launch checklist", href: "/admin/launch", icon: "launch", permission: P.settingsManage },
  { label: "Reports", href: "/admin/reports", icon: "reports", permission: P.reportView },
  { label: "Conversions", href: "/admin/conversions", icon: "conversions", permission: P.reportView },
  { label: "Import and export", href: "/admin/import", icon: "import", permission: P.importRun },
  { label: "Audit log", href: "/admin/audit", icon: "audit", permission: P.auditView },
];

export function visibleAdminNav(granted: readonly string[] | null | undefined): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => hasPermission(granted, item.permission));
}
