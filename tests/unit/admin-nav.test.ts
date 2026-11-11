import { describe, expect, it } from "vitest";
import { ADMIN_NAV, visibleAdminNav } from "@/shared/navigation/admin-nav";
import { ALL_PERMISSION_KEYS } from "@/core/permissions/keys";
import { ROLE_PERMISSIONS, ROLES } from "@/core/permissions/matrix";

const labels = (granted: readonly string[]) => visibleAdminNav(granted).map((i) => i.label);

describe("admin navigation", () => {
  it("shows everything to super_admin", () => {
    expect(labels(ROLE_PERMISSIONS[ROLES.superAdmin])).toEqual(ADMIN_NAV.map((i) => i.label));
  });

  it("hides the audit log from roles without audit:view", () => {
    for (const role of [ROLES.analyst, ROLES.editor, ROLES.catalogManager]) {
      expect(labels(ROLE_PERMISSIONS[role])).toContain("Dashboard");
      expect(labels(ROLE_PERMISSIONS[role])).not.toContain("Audit log");
    }
  });

  it("shows nothing without permissions", () => {
    expect(visibleAdminNav([])).toEqual([]);
    expect(visibleAdminNav(undefined)).toEqual([]);
  });

  it("only uses real permission keys, unique admin hrefs", () => {
    const hrefs = ADMIN_NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of ADMIN_NAV) {
      expect(item.href.startsWith("/admin/")).toBe(true);
      expect(ALL_PERMISSION_KEYS).toContain(item.permission);
    }
  });
});
