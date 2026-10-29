import { sql } from "drizzle-orm";
import { cloudinaryConfigured, envIssues, strictDomains } from "@/lib/config/env";
import { site } from "@/lib/config/site";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
/** Names and yes/no only. Secret values are never read into the page. */
export default async function Status() {
  let dbOk: boolean | null = null, migrated = false;
  if (db) {
    try { await db.execute(sql`select 1`); dbOk = true; const r = (await db.execute(sql`select to_regclass('public.import_staging') as t`)) as unknown as { rows: { t: string | null }[] }; migrated = !!r.rows[0]?.t; } catch { dbOk = false; }
  }
  const issues = envIssues();
  const row = (label: string, ok: boolean | null, note = "") => (<li key={label} className="flex items-start justify-between gap-4 border-b border-sand p-3 text-sm"><span>{label}{note && <span className="block text-xs text-ink/60">{note}</span>}</span><span className={ok === null ? "text-ink/60" : ok ? "text-forest" : "text-terracotta-600"}>{ok === null ? "n/a" : ok ? "OK" : "Needs attention"}</span></li>);
  return (<div className="max-w-2xl"><h1 className="font-display text-3xl font-semibold text-forest">Integration status</h1>
    <ul className="mt-6 rounded-card border border-sand bg-white">
      {row("Database connection", db ? dbOk : false, db ? "" : "DATABASE_URL is not set")}
      {row("Migrations up to 008 applied", db ? migrated : null, "Run db/migrations/008_integrity_and_lifecycle.sql in the Neon SQL Editor")}
      {row("Image uploads (Cloudinary)", cloudinaryConfigured(), "Needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET")}
      {row("Public site URL", /^https:\/\//.test(site.url), site.url)}
      {row("Strict affiliate domain checking", strictDomains(), "Set AFFILIATE_STRICT_DOMAINS=1 to reject links for merchants with no approved domains")}
    </ul>
    <h2 className="mb-2 mt-8 font-display text-2xl font-semibold text-forest">Environment checks</h2>
    {issues.length ? <ul className="list-disc pl-5 text-sm">{issues.map((i) => <li key={i.key}><code>{i.key}</code>: {i.problem}</li>)}</ul> : <p className="text-sm text-forest">All required variables look valid.</p>}
  </div>);
}
