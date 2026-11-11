/** Every permission the system knows. Add new keys here, then re-run `npm run db:seed-rbac`. */
export const PERMISSIONS = {
  dashboardView: "dashboard:view",
  productRead: "product:read",
  productWrite: "product:write",
  productPublish: "product:publish",
  categoryWrite: "category:write",
  brandWrite: "brand:write",
  merchantWrite: "merchant:write",
  affiliateRead: "affiliate:read",
  affiliateWrite: "affiliate:write",
  dealWrite: "deal:write",
  contentWrite: "content:write",
  contentPublish: "content:publish",
  mediaWrite: "media:write",
  seoWrite: "seo:write",
  homepageWrite: "homepage:write",
  importRun: "import:run",
  reportView: "report:view",
  auditView: "audit:view",
  settingsManage: "settings:manage",
  userManage: "user:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[];

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  "dashboard:view": "See the admin dashboard",
  "product:read": "View products in admin",
  "product:write": "Create and edit products and variants",
  "product:publish": "Publish, schedule and archive products",
  "category:write": "Manage categories",
  "brand:write": "Manage brands",
  "merchant:write": "Manage merchants and allowed domains",
  "affiliate:read": "View affiliate links and networks",
  "affiliate:write": "Manage affiliate networks, programmes and links",
  "deal:write": "Manage deals and coupons",
  "content:write": "Write and edit articles and pages",
  "content:publish": "Publish and schedule articles and pages",
  "media:write": "Upload and manage media",
  "seo:write": "Edit SEO metadata and redirects",
  "homepage:write": "Edit homepage sections and navigation",
  "import:run": "Run CSV imports and exports",
  "report:view": "View click and conversion reports",
  "audit:view": "View the audit log",
  "settings:manage": "Change site settings and feature flags",
  "user:manage": "Manage admin users and roles",
};

const KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_KEYS);
export function isPermissionKey(value: string): value is PermissionKey {
  return KEY_SET.has(value);
}
