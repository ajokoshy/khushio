import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export default async function CmsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (<div className="mx-auto max-w-page px-5 py-10">
    <div className="mb-8 flex items-center justify-between"><a href="/admin" className="font-display text-2xl font-semibold text-forest">Khushio admin</a>
      <nav className="flex gap-5 text-sm"><a href="/admin/dashboard" className="underline">Dashboard</a><a href="/admin" className="underline">Products</a><a href="/admin/content" className="underline">Deals, coupons, journal</a><a href="/admin/settings" className="underline">Settings</a></nav><form action={logout}><button className="text-sm underline">Sign out</button></form></div>{children}</div>);
}
