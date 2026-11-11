import { requireEnv } from "@/core/config/env";
import { logAudit, logAuditMany } from "@/core/audit";
import { ValidationError } from "@/core/errors";
import { isPermissionKey } from "@/core/permissions/keys";
import { isRoleKey, ROLES, type RoleKey } from "@/core/permissions/matrix";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { isRateLimited, LOGIN_RATE_LIMIT, rateKey, windowStart } from "./rate-limit";
import * as repo from "./repository";
import type { AuthUser } from "./types";
import { adminEmailSchema, loginSchema, newPasswordSchema } from "./validation";

function keysFor(email: string, ip: string | null) {
  const secret = requireEnv("AUTH_SECRET");
  return {
    email: rateKey("email", email, secret),
    ip: ip ? rateKey("ip", ip, secret) : null,
  };
}

/** True when this email/IP has not exceeded the failed-login limits in the current window. */
export async function checkLoginAllowed(email: string, ip: string | null): Promise<boolean> {
  const keys = keysFor(email, ip);
  const counts = await repo.countRecentFailures(keys.ip ? [keys.email, keys.ip] : [keys.email], windowStart(new Date()));
  return !isRateLimited(
    { email: counts.get(keys.email) ?? 0, ip: keys.ip ? (counts.get(keys.ip) ?? 0) : null },
    LOGIN_RATE_LIMIT,
  );
}

type FailureReason = "unknown_user" | "bad_password" | "inactive" | "invalid_input";

async function recordFailure(email: string, ip: string | null, reason: FailureReason, userId?: string) {
  const keys = keysFor(email, ip);
  const base = { action: repo.LOGIN_FAILED_ACTION, entityType: repo.LOGIN_ATTEMPT_ENTITY, metadata: { reason } };
  await logAuditMany([
    { ...base, entityId: keys.email, actor: userId ?? null },
    ...(keys.ip ? [{ ...base, entityId: keys.ip, actor: userId ?? null }] : []),
  ]);
}

/**
 * Called by the Auth.js credentials provider. Returns the user to put in the session, or null.
 * Every failure looks the same to the caller; the reason is only written to the audit log.
 * This runs for every sign-in path, including direct POSTs to /api/auth/callback/credentials.
 */
export async function authenticate(raw: unknown, ctx: { ip: string | null }): Promise<AuthUser | null> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  if (!(await checkLoginAllowed(email, ctx.ip))) return null;

  const user = await repo.findUserByEmail(email);
  // Always run a hash comparison so unknown emails cost the same time as wrong passwords.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user) {
    await recordFailure(email, ctx.ip, "unknown_user");
    return null;
  }
  if (!passwordOk) {
    await recordFailure(email, ctx.ip, "bad_password", user.id);
    return null;
  }
  if (!user.isActive) {
    await recordFailure(email, ctx.ip, "inactive", user.id);
    return null;
  }

  const access = await repo.getRolesAndPermissions(user.id);
  if (access.roles.length === 0) {
    // A user without any role has no business in the admin.
    await recordFailure(email, ctx.ip, "inactive", user.id);
    return null;
  }

  await repo.touchLastLogin(user.id);
  await logAudit({ actor: user.id, action: "auth.login_success", entityType: "user", entityId: user.id });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: access.roles.filter(isRoleKey),
    permissions: access.permissions.filter(isPermissionKey),
  };
}

/** Current database truth for a user (used by requirePermission(key, { fresh: true })). */
export async function getFreshAccess(userId: string) {
  const user = await repo.findUserById(userId);
  if (!user || !user.isActive) return null;
  const access = await repo.getRolesAndPermissions(userId);
  return { roles: access.roles.filter(isRoleKey), permissions: access.permissions.filter(isPermissionKey) };
}

/** Used by scripts/create-admin.ts. There is deliberately no public registration path. */
export async function createAdminUser(input: { email: string; name?: string | null; password: string; role?: RoleKey; passwordCost?: number }) {
  const email = adminEmailSchema.parse(input.email);
  const pw = newPasswordSchema.safeParse(input.password);
  if (!pw.success) throw new ValidationError(pw.error.issues.map((i) => i.message).join("; "));

  if (await repo.findUserByEmail(email)) throw new ValidationError("A user with this email already exists");
  const roleKey = input.role ?? ROLES.superAdmin;
  const roleId = await repo.findRoleIdByKey(roleKey);
  if (!roleId) throw new ValidationError(`Role "${roleKey}" not found. Run npm run db:seed-rbac first.`);

  const userId = await repo.insertUserWithRole({
    email,
    name: input.name?.trim() || null,
    passwordHash: await hashPassword(input.password, input.passwordCost),
    roleId,
  });
  await logAudit({ action: "user.created", entityType: "user", entityId: userId, metadata: { role: roleKey, via: "script" } });
  return { id: userId, email, role: roleKey };
}

/** Used by `create-admin --reset-password` for lockout recovery. */
export async function resetAdminPassword(emailInput: string, password: string) {
  const email = adminEmailSchema.parse(emailInput);
  const pw = newPasswordSchema.safeParse(password);
  if (!pw.success) throw new ValidationError(pw.error.issues.map((i) => i.message).join("; "));
  const user = await repo.findUserByEmail(email);
  if (!user) throw new ValidationError("No user with this email");
  await repo.updatePasswordHash(user.id, await hashPassword(password));
  await logAudit({ action: "user.password_reset", entityType: "user", entityId: user.id, metadata: { via: "script" } });
  return { id: user.id, email };
}

export async function recordLogout(userId: string) {
  await logAudit({ actor: userId, action: "auth.logout", entityType: "user", entityId: userId });
}
