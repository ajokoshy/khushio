"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, ScrollText, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { AdminNavIcon } from "@/shared/navigation/admin-nav";
import { cn } from "@/shared/ui/cn";

const ICONS: Record<AdminNavIcon, LucideIcon> = { dashboard: LayoutDashboard, audit: ScrollText };

type Item = { label: string; href: string; icon: AdminNavIcon };

type Props = {
  items: Item[];
  userEmail: string;
  roleLabel: string;
  /** A <form> with the sign-out server action, rendered by the server layout. */
  signOut: ReactNode;
  children: ReactNode;
};

/** Responsive admin frame: fixed sidebar on large screens, slide-in drawer on small ones. */
export function AdminFrame({ items, userEmail, roleLabel, signOut, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:flex">
      {open && <div className="fixed inset-0 z-40 bg-forest-950/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        id="admin-sidebar"
        className={cn(
          "w-64 shrink-0 border-r border-cream-200 bg-cream-50 p-4",
          open ? "fixed inset-y-0 left-0 z-50 block overflow-y-auto" : "hidden",
          "lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto",
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin/dashboard" className="font-display text-xl">Khushio admin</Link>
          <button type="button" className="rounded-lg p-1 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Admin">
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
                      active ? "bg-forest-800 text-cream-50" : "hover:bg-forest-100",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-cream-200 bg-cream-100/90 px-4 backdrop-blur">
          <button
            type="button"
            className="rounded-lg p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="admin-sidebar"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
            <span className="min-w-0 truncate" title={userEmail}>{userEmail}</span>
            <span className="hidden rounded-full bg-forest-100 px-2 py-0.5 text-xs sm:inline">{roleLabel}</span>
            {signOut}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
