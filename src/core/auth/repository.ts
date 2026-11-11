import { and, eq, gte, inArray, count } from "drizzle-orm";
import { db } from "@/core/database/client";
import { auditLogs, permissions, rolePermissions, roles, userRoles, users } from "@/core/database/schema";

import { LOGIN_ATTEMPT_ENTITY } from "@/core/audit/constants";
export { LOGIN_ATTEMPT_ENTITY };
export const LOGIN_FAILED_ACTION = "auth.login_failed";

export async function findUserByEmail(email: string) {
  const [row] = await db()
    .select({ id: users.id, email: users.email, name: users.name, passwordHash: users.passwordHash, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export async function findUserById(id: string) {
  const [row] = await db()
    .select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

/** Role keys and the union of their permission keys for one user. */
export async function getRolesAndPermissions(userId: string) {
  const rows = await db()
    .select({ role: roles.key, permission: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  const roleKeys = new Set<string>();
  const permissionKeys = new Set<string>();
  for (const r of rows) {
    roleKeys.add(r.role);
    if (r.permission) permissionKeys.add(r.permission);
  }
  return { roles: [...roleKeys], permissions: [...permissionKeys] };
}

export async function touchLastLogin(userId: string) {
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

/** Failed-login counts per rate key since `since`. Uses the existing audit_entity_idx index. */
export async function countRecentFailures(keys: string[], since: Date): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const rows = await db()
    .select({ key: auditLogs.entityId, n: count() })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityType, LOGIN_ATTEMPT_ENTITY),
        eq(auditLogs.action, LOGIN_FAILED_ACTION),
        inArray(auditLogs.entityId, keys),
        gte(auditLogs.createdAt, since),
      ),
    )
    .groupBy(auditLogs.entityId);
  return new Map(rows.filter((r) => r.key).map((r) => [r.key as string, Number(r.n)]));
}

export async function findRoleIdByKey(key: string) {
  const [row] = await db().select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  return row?.id ?? null;
}

export async function insertUserWithRole(input: { email: string; name: string | null; passwordHash: string; roleId: string }) {
  const [user] = await db()
    .insert(users)
    .values({ email: input.email, name: input.name, passwordHash: input.passwordHash })
    .returning({ id: users.id });
  if (!user) throw new Error("Failed to create user");
  await db().insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  await db().update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function deleteUserById(userId: string) {
  await db().delete(users).where(eq(users.id, userId));
}
