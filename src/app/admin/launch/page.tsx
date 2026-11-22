import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import type { CheckStatus } from "@/modules/launch/checks";
import { getLaunchReport } from "@/modules/launch/service";

export const metadata = { title: "Launch checklist", robots: { index: false } };
export const dynamic = "force-dynamic";

const BADGE: Record<CheckStatus, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-forest-100 text-forest-800" },
  warn: { label: "Check", className: "bg-cream-200 text-ink" },
  fail: { label: "Fix before launch", className: "bg-coral-100 text-coral-600" },
  manual: { label: "Do by hand", className: "border border-cream-200 text-ink-600" },
};

export default async function LaunchPage() {
  await requirePagePermission(P.settingsManage);
  const { results, summary } = await getLaunchReport();
  const groups = [...new Set(results.map((r) => r.group))];
  return (
    <>
      <h1 className="text-3xl">Launch checklist</h1>
      <p className="mt-2 max-w-prose text-ink-600">What the site can check about itself before and after launch. Items marked &ldquo;Do by hand&rdquo; cannot be seen from here; docs/LAUNCH.md explains each one.</p>
      <p role="status" className={`mt-4 max-w-prose rounded-xl px-4 py-3 text-sm ${summary.ready ? "bg-forest-100 text-forest-800" : "bg-coral-100 text-coral-600"}`}>
        {summary.ready ? "Nothing blocks the launch." : `${summary.fail} item${summary.fail === 1 ? "" : "s"} to fix before launch.`} {summary.ok} OK, {summary.warn} to check, {summary.manual} to do by hand.
      </p>
      {groups.map((group) => (
        <section key={group} aria-labelledby={`g-${group}`} className="mt-8">
          <h2 id={`g-${group}`} className="mb-3 text-xl">{group}</h2>
          <ul className="divide-y divide-cream-200 rounded-card border border-cream-200 bg-white">
            {results.filter((r) => r.group === group).map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className={`inline-flex h-fit w-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[r.status].className}`}>{BADGE[r.status].label}</span>
                <div>
                  <p className="font-medium">{r.label}</p>
                  <p className="text-sm text-ink-600">{r.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
