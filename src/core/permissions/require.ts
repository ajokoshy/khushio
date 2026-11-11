import { forbidden, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/core/auth";
import { getFreshAccess } from "@/core/auth/service";
import { ForbiddenError, UnauthorizedError } from "@/core/errors";
import { hasPermission, assertPermission } from "./guard";
import type { PermissionKey } from "./keys";

type Options = {
  /**
   * Re-read the user's active flag and permissions from the database instead of trusting the
   * session token. Use for sensitive writes (user:manage, settings:manage).
   */
  fresh?: boolean;
};

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session;
}

/**
 * For server actions and route handlers. Throws UnauthorizedError (401) or ForbiddenError (403).
 * Route handlers: `catch (e) { return errorResponse(e) }` from "@/core/errors/http".
 */
export async function requirePermission(key: PermissionKey, options: Options = {}): Promise<Session> {
  const session = await requireSession();
  let granted: readonly string[] = session.user.permissions;
  if (options.fresh) {
    const access = await getFreshAccess(session.user.id);
    if (!access) throw new UnauthorizedError();
    granted = access.permissions;
  }
  assertPermission(granted, key);
  return session;
}

/** For server-rendered admin pages: sends signed-out users to login and answers 403 for missing permission. */
export async function requirePagePermission(key: PermissionKey): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin-login");
  if (!hasPermission(session.user.permissions, key)) forbidden();
  return session;
}

export { ForbiddenError, UnauthorizedError };
