"use server";

import { auth, signOut } from "@/core/auth";
import { recordLogout } from "@/core/auth/service";

export async function signOutAction() {
  const session = await auth();
  if (session?.user?.id) await recordLogout(session.user.id);
  await signOut({ redirectTo: "/admin-login" });
}
