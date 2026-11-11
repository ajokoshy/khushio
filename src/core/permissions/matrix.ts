import { ALL_PERMISSION_KEYS, PERMISSIONS as P, type PermissionKey } from "./keys";

export const ROLES = {
  superAdmin: "super_admin",
  editor: "editor",
  catalogManager: "catalog_manager",
  analyst: "analyst",
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];
export const ALL_ROLE_KEYS = Object.values(ROLES) as RoleKey[];

export const ROLE_NAMES: Record<RoleKey, string> = {
  super_admin: "Super admin",
  editor: "Editor",
  catalog_manager: "Catalog manager",
  analyst: "Analyst",
};

/** Source of truth for `role_permissions`. `npm run db:seed-rbac` makes the database match this. */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  super_admin: ALL_PERMISSION_KEYS,
  editor: [
    P.dashboardView, P.productRead, P.contentWrite, P.contentPublish, P.mediaWrite, P.seoWrite, P.homepageWrite,
  ],
  catalog_manager: [
    P.dashboardView, P.productRead, P.productWrite, P.productPublish, P.categoryWrite, P.brandWrite,
    P.merchantWrite, P.affiliateRead, P.affiliateWrite, P.dealWrite, P.mediaWrite, P.importRun,
  ],
  analyst: [P.dashboardView, P.productRead, P.affiliateRead, P.reportView],
};

const ROLE_SET: ReadonlySet<string> = new Set(ALL_ROLE_KEYS);
export function isRoleKey(value: string): value is RoleKey {
  return ROLE_SET.has(value);
}

/** Union of the permissions of the given roles (static matrix; the database is read at sign-in). */
export function permissionsForRoles(roles: readonly string[]): PermissionKey[] {
  const out = new Set<PermissionKey>();
  for (const r of roles) if (isRoleKey(r)) for (const p of ROLE_PERMISSIONS[r]) out.add(p);
  return [...out];
}
