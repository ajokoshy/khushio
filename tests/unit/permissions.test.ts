import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_KEYS, PERMISSIONS as P, isPermissionKey } from "@/core/permissions/keys";
import { ALL_ROLE_KEYS, ROLE_PERMISSIONS, ROLES, permissionsForRoles } from "@/core/permissions/matrix";
import { assertPermission, hasPermission } from "@/core/permissions/guard";
import { ForbiddenError } from "@/core/errors";

const can = (role: (typeof ALL_ROLE_KEYS)[number], key: (typeof ALL_PERMISSION_KEYS)[number]) =>
  hasPermission(ROLE_PERMISSIONS[role], key);

describe("permission matrix", () => {
  it("gives super_admin every permission", () => {
    for (const key of ALL_PERMISSION_KEYS) expect(can(ROLES.superAdmin, key)).toBe(true);
  });

  it("only super_admin can manage users and settings", () => {
    for (const role of ALL_ROLE_KEYS.filter((r) => r !== ROLES.superAdmin)) {
      expect(can(role, P.userManage)).toBe(false);
      expect(can(role, P.settingsManage)).toBe(false);
    }
  });

  it("lets catalog_manager write catalogue data but not content", () => {
    expect(can(ROLES.catalogManager, P.productWrite)).toBe(true);
    expect(can(ROLES.catalogManager, P.merchantWrite)).toBe(true);
    expect(can(ROLES.catalogManager, P.contentPublish)).toBe(false);
    expect(can(ROLES.catalogManager, P.auditView)).toBe(false);
  });

  it("lets editor publish content but not touch products or affiliate links", () => {
    expect(can(ROLES.editor, P.contentWrite)).toBe(true);
    expect(can(ROLES.editor, P.contentPublish)).toBe(true);
    expect(can(ROLES.editor, P.productWrite)).toBe(false);
    expect(can(ROLES.editor, P.affiliateWrite)).toBe(false);
  });

  it("keeps analyst read-only", () => {
    expect(can(ROLES.analyst, P.reportView)).toBe(true);
    expect(can(ROLES.analyst, P.dashboardView)).toBe(true);
    for (const key of ALL_PERMISSION_KEYS.filter((k) => k.endsWith(":write") || k.endsWith(":publish") || k.endsWith(":manage"))) {
      expect(can(ROLES.analyst, key)).toBe(false);
    }
  });

  it("only references known permission keys and grants every key to some role", () => {
    const granted = new Set<string>();
    for (const role of ALL_ROLE_KEYS) for (const key of ROLE_PERMISSIONS[role]) {
      expect(isPermissionKey(key)).toBe(true);
      granted.add(key);
    }
    for (const key of ALL_PERMISSION_KEYS) expect(granted.has(key)).toBe(true);
  });

  it("unions permissions across roles and ignores unknown roles", () => {
    const merged = permissionsForRoles([ROLES.editor, ROLES.analyst, "made_up"]);
    expect(merged).toContain(P.contentWrite);
    expect(merged).toContain(P.reportView);
    expect(merged).not.toContain(P.productWrite);
  });
});

describe("permission guard", () => {
  it("denies when nothing is granted", () => {
    expect(hasPermission(undefined, P.productWrite)).toBe(false);
    expect(hasPermission([], P.productWrite)).toBe(false);
  });

  it("assertPermission throws ForbiddenError (403) when missing", () => {
    expect(() => assertPermission([P.dashboardView], P.productWrite)).toThrow(ForbiddenError);
    expect(() => assertPermission([P.productWrite], P.productWrite)).not.toThrow();
    try {
      assertPermission([], P.userManage);
    } catch (e) {
      expect((e as ForbiddenError).status).toBe(403);
    }
  });
});
