import { ALL_PERMISSION_KEYS } from "@/core/permissions/keys";
import { ROLES } from "@/core/permissions/matrix";
import { verifyPassword } from "./password";
import * as repo from "./repository";
import type { AuthUser } from "./types";
import { loginSchema } from "./validation";

/** Every active row in the `users` table is the site owner, so it gets full access. */
const OWNER_ROLES = [ROLES.superAdmin];
const OWNER_PERMISSIONS = [...ALL_PERMISSION_KEYS];

/** Called by the Auth.js credentials provider. Returns the user for the session, or null. */
export async function authenticate(raw: unknown): Promise<AuthUser | null> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const user = await repo.findUserByEmail(email);
  if (!user || !user.isActive) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  await repo.touchLastLogin(user.id);
  return { id: user.id, email: user.email, name: user.name, roles: OWNER_ROLES, permissions: OWNER_PERMISSIONS };
}

/** Used by requirePermission(key, { fresh: true }): is this user still active in the database? */
export async function getFreshAccess(userId: string) {
  const user = await repo.findUserById(userId);
  if (!user || !user.isActive) return null;
  return { roles: OWNER_ROLES, permissions: OWNER_PERMISSIONS };
}
