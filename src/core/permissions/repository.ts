import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/core/database/client";
import { permissions, rolePermissions, roles } from "@/core/database/schema";
import { ALL_PERMISSION_KEYS, PERMISSION_DESCRIPTIONS } from "./keys";
import { ALL_ROLE_KEYS, ROLE_NAMES, ROLE_PERMISSIONS } from "./matrix";

/**
 * Idempotent: makes roles, permissions and role_permissions match the matrix in code.
 * Safe to run on every deploy or by hand. Never touches users or user_roles.
 */
export async function syncRbac() {
  const d = db();

  await d
    .insert(permissions)
    .values(ALL_PERMISSION_KEYS.map((key) => ({ key, description: PERMISSION_DESCRIPTIONS[key] })))
    .onConflictDoUpdate({ target: permissions.key, set: { description: sql`excluded.description` } });

  await d
    .insert(roles)
    .values(ALL_ROLE_KEYS.map((key) => ({ key, name: ROLE_NAMES[key] })))
    .onConflictDoUpdate({ target: roles.key, set: { name: sql`excluded.name` } });

  const roleRows = await d.select({ id: roles.id, key: roles.key }).from(roles).where(inArray(roles.key, ALL_ROLE_KEYS));
  const permRows = await d.select({ id: permissions.id, key: permissions.key }).from(permissions).where(inArray(permissions.key, ALL_PERMISSION_KEYS));
  const permIdByKey = new Map(permRows.map((p) => [p.key, p.id]));

  let linked = 0;
  for (const role of roleRows) {
    const wanted = (ROLE_PERMISSIONS[role.key as keyof typeof ROLE_PERMISSIONS] ?? [])
      .map((k) => permIdByKey.get(k))
      .filter((v): v is string => !!v);
    if (wanted.length === 0) continue;

    await d
      .insert(rolePermissions)
      .values(wanted.map((permissionId) => ({ roleId: role.id, permissionId })))
      .onConflictDoNothing();

    // Remove grants that are no longer in the matrix.
    await d
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, role.id), notInArray(rolePermissions.permissionId, wanted)));
    linked += wanted.length;
  }

  return { permissions: ALL_PERMISSION_KEYS.length, roles: ALL_ROLE_KEYS.length, grants: linked };
}
