import { Alert, Button, Card, PageTitle, SectionTitle } from "@/components/ui";
import { cloudinaryConfigured, mediaMaxItems } from "@/lib/config/env";
import { mediaStats } from "@/lib/data/media";
import { WIDTHS } from "@/lib/media/delivery";
import { RETENTION, dbUsage } from "@/lib/maintenance";
import { runMaintenanceNow } from "../../actions";
export const dynamic = "force-dynamic";
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const dbLimitMb = () => { const n = Number(process.env.DB_SOFT_LIMIT_MB); return n > 0 ? n : 450; };
export default async function Costs({ searchParams }: { searchParams: Promise<{ ran?: string; clicks?: string; audit?: string; login?: string; staging?: string }> }) {
  const sp = await searchParams, [db, media] = await Promise.all([dbUsage(), mediaStats()]);
  const pct = Math.min(100, Math.round((db.totalBytes / 1048576 / dbLimitMb()) * 100)), mediaPct = Math.min(100, Math.round((media.count / mediaMaxItems()) * 100));
  const bar = (p: number) => <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sand" role="img" aria-label={`${p}% used`}><div className={`h-full ${p >= 80 ? "bg-terracotta" : "bg-forest"}`} style={{ width: `${p}%` }} /></div>;
  return (<div className="max-w-3xl"><PageTitle>Costs and storage</PageTitle>
    {sp.ran && <Alert tone="success">Clean-up done: {sp.clicks} old click rows summarised into daily totals, {sp.audit} old log entries, {sp.login} login records and {sp.staging} old uploads removed.</Alert>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <Card><h2 className="font-medium text-forest">Database (Neon)</h2><p className="mt-1 text-2xl font-semibold">{mb(db.totalBytes)}</p><p className="text-xs text-ink/60">of about {dbLimitMb()} MB budget ({pct}%). Set DB_SOFT_LIMIT_MB to match your plan.</p>{bar(pct)}</Card>
      <Card><h2 className="font-medium text-forest">Images (Cloudinary)</h2><p className="mt-1 text-2xl font-semibold">{media.count} <span className="text-base font-normal">images · {mb(media.bytes)}</span></p><p className="text-xs text-ink/60">limit {mediaMaxItems()} images; {media.unused} unused (delete them in Media to free storage).{!cloudinaryConfigured() && " Not configured."}</p>{bar(mediaPct)}</Card></div>
    {pct >= 80 && <div className="mt-4"><Alert tone="warn">The database is above 80% of its budget. Run the clean-up below, and consider a larger plan.</Alert></div>}
    <SectionTitle>Largest tables</SectionTitle>
    <ul className="divide-y divide-sand rounded-card border border-sand bg-white text-sm">{db.tables.map((t) => <li key={t.name} className="flex justify-between p-3"><code>{t.name}</code><span>{mb(t.bytes)} · ~{t.rows} rows</span></li>)}</ul>
    <SectionTitle>Clean-up</SectionTitle>
    <Card><p className="text-sm">Raw click rows: <b>{db.clickRows}</b> · daily summaries kept: <b>{db.clickDays}</b>.</p><p className="mt-2 text-sm text-ink/70">Clicks older than {RETENTION.clickDays} days are turned into one small row per offer per day. Audit entries older than {RETENTION.auditDays} days, login records older than {RETENTION.loginDays} day and import uploads older than {RETENTION.stagingDays} day are deleted. This runs by itself on a sample of affiliate clicks; you can also run it now.</p>
      <form action={runMaintenanceNow} className="mt-3"><Button variant="secondary" small>Run clean-up now</Button></form></Card>
    <SectionTitle>Cost controls built into the site</SectionTitle>
    <ul className="list-disc space-y-2 pl-6 text-sm text-ink/80">
      <li><b>Vercel:</b> almost every page is built once and served from the cache. Edits refresh only the pages they affect (cache tags). Pages that expire by date refresh at most every 30 minutes; the rest every 6 to 24 hours. No middleware, no image optimisation service, no per-request analytics.</li>
      <li><b>Cloudinary:</b> pictures are delivered in only {WIDTHS.length} widths ({WIDTHS.join(", ")} px) with automatic format and quality, so each picture creates at most {WIDTHS.length} derived files. Uploads are capped at 3 MB, stored at 1600 px maximum, checked for duplicates before upload, and unused images can be deleted from Cloudinary.</li>
      <li><b>Database:</b> only values that differ from defaults are stored (settings, homepage sections); built-in pages and layouts cost nothing until edited; article history keeps the last 5 versions; clicks are summarised after {RETENTION.clickDays} days; media rows store a reference, never the file.</li></ul></div>);
}
