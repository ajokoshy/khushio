import { AUTH_AUDIT } from "@/core/audit/constants";
import { logAudit } from "@/core/audit";
import { ALL_PERMISSION_KEYS } from "@/core/permissions/keys";
import { ROLES } from "@/core/permissions/matrix";
import { verifyPassword } from "./password";
import * as repo from "./repository";
import type { AuthUser } from "./types";
import { loginSchema } from "./validation";

/**
 * Login model: the admin's email and bcrypt password hash live in the `users` table (created or
 * changed with drizzle/migrations/set-admin.sql). Every ACTIVE row is the site owner, so it gets
 * full access. There are no admin credentials in environment variables or code.
 */
const OWNER_ROLES = [ROLES.superAdmin];
const OWNER_PERMISSIONS = [...ALL_PERMISSION_KEYS];

/**
 * Compared against when the email is unknown, so a wrong email takes as long as a wrong password
 * and the response time does not reveal which emails exist. It is a hash of a throwaway string.
 */
const TIMING_EQUALISER_HASH = "$2b$12$Kd0wK/OMkF8Uwk1j3vd41e.fF5GbkS0qmU.td7usENo5Irm2l3JZK";

/** Called by the Auth.js credentials provider. Returns the user for the session, or null. */
export async function authenticate(raw: unknown): Promise<AuthUser | null> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const user = await repo.findUserByEmail(email);
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? TIMING_EQUALISER_HASH);
  if (!user || !user.isActive || !passwordOk) return null;

  await repo.touchLastLogin(user.id);
  try {
    await logAudit({ actor: user.id, action: AUTH_AUDIT.loginSuccess, entityType: "user", entityId: user.id });
  } catch (error) {
    // A failed audit write must not lock the owner out.
    console.error("Audit write failed for login", error);
  }
  return { id: user.id, email: user.email, name: user.name, roles: OWNER_ROLES, permissions: OWNER_PERMISSIONS };
}

/** Used by requirePermission(key, { fresh: true }): is this user still active in the database? */
export async function getFreshAccess(userId: string) {
  const user = await repo.findUserById(userId);
  if (!user || !user.isActive) return null;
  return { roles: OWNER_ROLES, permissions: OWNER_PERMISSIONS };
}
