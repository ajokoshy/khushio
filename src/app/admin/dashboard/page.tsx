import { PERMISSIONS as P, hasPermission } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { getDashboardStats } from "@/modules/dashboard/service";
import type { DashboardStats } from "@/modules/dashboard/types";
import { EmptyState } from "@/shared/admin/empty-state";

export const metadata = { title: "Dashboard", robots: { index: false } };

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-cream-200 bg-cream-50 p-5">
      <p className="text-sm text-ink-600">{label}</p>
      <p className="mt-1 font-display text-3xl">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

export default async function Dashboard() {
  const session = await requirePagePermission(P.dashboardView);
  const granted = session.user.permissions;

  let stats: DashboardStats | null = null;
  try {
    stats = await getDashboardStats();
  } catch (error) {
    console.error("Dashboard stats failed", error);
  }

  const cards = stats
    ? [
        hasPermission(granted, P.productRead) && <StatCard key="p" label="Products" value={stats.products} />,
        hasPermission(granted, P.affiliateRead) && <StatCard key="l" label="Affiliate links" value={stats.affiliateLinks} />,
        hasPermission(granted, P.reportView) && <StatCard key="c" label="Clicks, last 7 days" value={stats.clicksLast7Days} />,
      ].filter(Boolean)
    : [];

  return (
    <>
      <h1 className="text-3xl">Dashboard</h1>
      <p className="mt-2 text-ink-600">Counts refresh about once a minute.</p>
      <div className="mt-6">
        {!stats ? (
          <EmptyState title="Statistics are unavailable" description="The database could not be reached. Try again in a moment." />
        ) : cards.length === 0 ? (
          <EmptyState title="Nothing to show yet" description="Your role does not include any dashboard figures." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
        )}
      </div>
    </>
  );
}
