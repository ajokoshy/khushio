import { ForbiddenError } from "@/core/errors";
import type { PermissionKey } from "./keys";

/** Pure check, safe anywhere (no framework imports). */
export function hasPermission(granted: readonly string[] | null | undefined, key: PermissionKey): boolean {
  return !!granted && granted.includes(key);
}

export function assertPermission(granted: readonly string[] | null | undefined, key: PermissionKey): void {
  if (!hasPermission(granted, key)) throw new ForbiddenError(`Missing permission: ${key}`);
}
