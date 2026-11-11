import type { DefaultSession } from "next-auth";
import type { PermissionKey } from "@/core/permissions/keys";
import type { RoleKey } from "@/core/permissions/matrix";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  roles: RoleKey[];
  permissions: PermissionKey[];
};

declare module "next-auth" {
  interface User {
    roles: RoleKey[];
    permissions: PermissionKey[];
  }
  interface Session {
    user: {
      id: string;
      roles: RoleKey[];
      permissions: PermissionKey[];
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    roles?: RoleKey[];
    permissions?: PermissionKey[];
  }
}
