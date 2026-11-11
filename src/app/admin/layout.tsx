import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { ROLE_NAMES, isRoleKey } from "@/core/permissions";
import { AdminFrame } from "@/shared/layouts/admin-frame";
import { ToastProvider } from "@/shared/admin/toast";
import { visibleAdminNav } from "@/shared/navigation/admin-nav";
import { signOutAction } from "./actions";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware already redirects signed-out visitors; this is the server-side backstop.
  const session = await auth();
  if (!session?.user?.id) redirect("/admin-login");

  const items = visibleAdminNav(session.user.permissions).map(({ label, href, icon }) => ({ label, href, icon }));
  const roleLabel = session.user.roles.map((r) => (isRoleKey(r) ? ROLE_NAMES[r] : r)).join(", ");

  return (
    <ToastProvider>
      <AdminFrame
        items={items}
        userEmail={session.user.email ?? ""}
        roleLabel={roleLabel}
        signOut={
          <form action={signOutAction}>
            <button type="submit" className="rounded-xl border border-forest-800 px-3 py-1.5 text-sm font-medium hover:bg-forest-100">
              Sign out
            </button>
          </form>
        }
      >
        {children}
      </AdminFrame>
    </ToastProvider>
  );
}
