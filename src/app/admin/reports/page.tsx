import Link from "next/link";
import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { formatMinor } from "@/core/validation/money";
import { CONVERSION_STATUS_LABELS, type ConversionStatus } from "@/modules/conversions/types";
import { parseRange, REPORT_RANGES } from "@/modules/reports/days";
import { buildClickReport } from "@/modules/reports/report-service";
import { getRetentionDays } from "@/modules/reports/rollup";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from "@/modules/reports/settings";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { runRollupAction } from "./actions";
import { RetentionForm } from "./retention-form";

export const metadata = { title: "Reports", robots: { index: false } };

const n = (value: number) => value.toLocaleString("en-IN");

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-cream-200 bg-cream-50 p-5">
      <p className="text-sm text-ink-600">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-600">{hint}</p>}
    </div>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-xl">{title}</h2>
      {note && <p className="mt-1 text-sm text-ink-600">{note}</p>}
      <div className="mt-3 overflow-x-auto rounded-card border border-cream-200 bg-cream-50">{children}</div>
    </section>
  );
}

const th = "px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-600";
const td = "px-4 py-2 align-top";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requirePagePermission(P.reportView);
  const canManage = hasPermission(session.user.permissions, P.settingsManage);
  const sp = await searchParams;
  const range = parseRange(firstParam(sp.days));
  const [report, retentionDays] = await Promise.all([buildClickReport(range), getRetentionDays()]);
  const peak = Math.max(1, ...report.byDay.map((d) => d.clicks));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Reports</h1>
          <p className="mt-2 text-ink-600">Clicks on affiliate links, bots left out. Days are India days. Complete days only; today is shown separately.</p>
        </div>
        <nav aria-label="Time range" className="flex gap-2">
          {REPORT_RANGES.map((d) => (
            <Link key={d} href={`/admin/reports?days=${d}`} aria-current={d === range ? "page" : undefined} className={`rounded-xl border px-3 py-1.5 text-sm ${d === range ? "border-forest-800 bg-forest-800 text-cream-50" : "border-cream-200 hover:bg-forest-100"}`}>Last {d} days</Link>
          ))}
        </nav>
      </div>

      <div className="mt-6"><Notice code={firstParam(sp.notice)} /></div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label={`Clicks, ${report.range.from} to ${report.range.to}`} value={n(report.totalClicks)} />
        <Card label="Clicks today so far" value={n(report.todaySoFar)} hint="From raw clicks; joins the totals after tonight's roll-up." />
        <Card label="Conversions in the same period" value={n(report.conversions.reduce((s, c) => s + c.orders, 0))} hint="By conversion date." />
      </div>

      <Section id="by-day" title="Clicks by day">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Clicks by day</caption>
          <thead><tr><th scope="col" className={th}>Day</th><th scope="col" className={`${th} text-right`}>Clicks</th><th scope="col" className={th}><span className="sr-only">Chart</span></th></tr></thead>
          <tbody className="divide-y divide-cream-200">
            {[...report.byDay].reverse().map((d) => (
              <tr key={d.day}>
                <td className={td}>{d.day}</td>
                <td className={`${td} text-right tabular-nums`}>{n(d.clicks)}</td>
                <td className={`${td} w-1/2`}><div className="h-2 rounded bg-forest-800" style={{ width: `${(d.clicks / peak) * 100}%` }} aria-hidden="true" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="top-links" title="Top links" note="The 20 links with the most clicks.">
        {report.topLinks.length === 0 ? <p className="px-4 py-3 text-sm text-ink-600">No clicks in this period.</p> : (
          <table className="min-w-full text-sm">
            <caption className="sr-only">Top links</caption>
            <thead><tr><th scope="col" className={th}>Link</th><th scope="col" className={th}>Merchant</th><th scope="col" className={th}>Product</th><th scope="col" className={`${th} text-right`}>Clicks</th></tr></thead>
            <tbody className="divide-y divide-cream-200">
              {report.topLinks.map((l) => (
                <tr key={l.linkId}><td className={td}><code className="text-xs">{l.slug}</code></td><td className={td}>{l.merchantName}</td><td className={td}>{l.productName ?? "-"}</td><td className={`${td} text-right tabular-nums`}>{n(l.clicks)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section id="by-merchant" title="By merchant">
          {report.byMerchant.length === 0 ? <p className="px-4 py-3 text-sm text-ink-600">No clicks in this period.</p> : (
            <table className="min-w-full text-sm">
              <caption className="sr-only">Clicks by merchant</caption>
              <thead><tr><th scope="col" className={th}>Merchant</th><th scope="col" className={`${th} text-right`}>Clicks</th></tr></thead>
              <tbody className="divide-y divide-cream-200">{report.byMerchant.map((m) => <tr key={m.merchantId}><td className={td}>{m.merchantName}</td><td className={`${td} text-right tabular-nums`}>{n(m.clicks)}</td></tr>)}</tbody>
            </table>
          )}
        </Section>
        <Section id="by-product" title="By product" note="Links that are not tied to a product are not listed here.">
          {report.byProduct.length === 0 ? <p className="px-4 py-3 text-sm text-ink-600">No clicks in this period.</p> : (
            <table className="min-w-full text-sm">
              <caption className="sr-only">Clicks by product</caption>
              <thead><tr><th scope="col" className={th}>Product</th><th scope="col" className={`${th} text-right`}>Clicks</th></tr></thead>
              <tbody className="divide-y divide-cream-200">{report.byProduct.map((p) => <tr key={p.productId}><td className={td}>{p.productName}</td><td className={`${td} text-right tabular-nums`}>{n(p.clicks)}</td></tr>)}</tbody>
            </table>
          )}
        </Section>
      </div>

      <Section id="zero" title="Links with no clicks" note="Active links that nobody clicked in this period (links made today are left out). Worth checking: is the Buy button visible, is the product published?">
        {report.zeroClickLinks.length === 0 ? <p className="px-4 py-3 text-sm text-ink-600">Every active link was clicked at least once.</p> : (
          <table className="min-w-full text-sm">
            <caption className="sr-only">Links with no clicks</caption>
            <thead><tr><th scope="col" className={th}>Link</th><th scope="col" className={th}>Merchant</th><th scope="col" className={th}>Product</th><th scope="col" className={th}>Created</th></tr></thead>
            <tbody className="divide-y divide-cream-200">
              {report.zeroClickLinks.map((l) => (
                <tr key={l.linkId}><td className={td}><code className="text-xs">{l.slug}</code></td><td className={td}>{l.merchantName}</td><td className={td}>{l.productName ?? "-"}</td><td className={td}>{formatAdminDateTime(l.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="conversions" title="Conversions in this period" note="By conversion date, from the conversions you entered or imported.">
        {report.conversions.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-600">No conversions in this period. <Link href="/admin/conversions" className="underline">Open conversions</Link></p>
        ) : (
          <table className="min-w-full text-sm">
            <caption className="sr-only">Conversions by status</caption>
            <thead><tr><th scope="col" className={th}>Status</th><th scope="col" className={`${th} text-right`}>Orders</th><th scope="col" className={`${th} text-right`}>Commission</th></tr></thead>
            <tbody className="divide-y divide-cream-200">
              {report.conversions.map((c) => (
                <tr key={`${c.status}-${c.currency}`}><td className={td}>{CONVERSION_STATUS_LABELS[c.status as ConversionStatus] ?? c.status}</td><td className={`${td} text-right tabular-nums`}>{n(c.orders)}</td><td className={`${td} text-right tabular-nums`}>{formatMinor(c.commissionMinor, c.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <section aria-labelledby="retention-heading" className="mt-12 max-w-3xl border-t border-cream-200 pt-6">
        <h2 id="retention-heading" className="text-xl">Click storage</h2>
        <p className="mt-2 text-sm text-ink-600">
          Every night at about 2:00 India time the site counts the day&apos;s clicks into the totals above and then deletes raw clicks older than {retentionDays} days. The totals are kept; only the raw rows go. If the database grows faster than expected, shorten this to 14 days.
        </p>
        {canManage ? (
          <>
            <div className="mt-4"><RetentionForm current={retentionDays} min={MIN_RETENTION_DAYS} max={MAX_RETENTION_DAYS} /></div>
            <div className="mt-4">
              <ConfirmActionButton label="Run the nightly job now" title="Run the roll-up and purge now?" description="Counts the finished days into the totals and removes raw clicks older than the retention. Safe to repeat." confirmLabel="Run" action={runRollupAction} />
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-600">Changing this needs the settings permission.</p>
        )}
      </section>
    </>
  );
}
