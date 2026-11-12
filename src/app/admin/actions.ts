"use server";

import { logAudit } from "@/core/audit";
import { AUTH_AUDIT } from "@/core/audit/constants";
import { auth, signOut } from "@/core/auth";

export async function signOutAction() {
  const session = await auth();
  if (session?.user?.id) {
    try {
      await logAudit({ actor: session.user.id, action: AUTH_AUDIT.logout, entityType: "user", entityId: session.user.id });
    } catch (error) {
      console.error("Audit write failed for logout", error);
    }
  }
  await signOut({ redirectTo: "/admin-login" });
}
