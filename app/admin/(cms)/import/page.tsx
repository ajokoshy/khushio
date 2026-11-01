import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildImportPlan } from "@/lib/import-db";
import { IMPORT_CHUNK, IMPORT_KINDS, IMPORT_ROW_LIMIT, type ImportKind } from "@/lib/import-kinds";
import { cancelImport, confirmImport, previewImport } from "../../actions";
export const dynamic = "force-dynamic";
type SP = { stage?: string; update?: string; done?: string; kind?: string; created?: string; updated?: string; skipped?: string; e?: string };
const ERR: Record<string, string> = { "1": "Choose a CSV file under 1 MB.", "2": "That upload has expired. Upload the file again.", "3": "Nothing to apply: every row was skipped or blocked. Fix the file and upload again." };
const badge = { create: "bg-sage text-forest", update: "bg-[#F6E6BD] text-[#7A5F10]", "skip-existing": "bg-sand text-ink/70" } as const;
export default async function Import({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  let stage: { id: string; csv: string; kind: string } | undefined;
  if (db && sp.stage && /^[0-9a-f-]{36}$/i.test(sp.stage)) [stage] = await db.select().from(schema.importStaging).where(eq(schema.importStaging.id, sp.stage));
  const kind = (stage && stage.kind in IMPORT_KINDS ? stage.kind : "products") as ImportKind;
  const plan = stage ? await buildImportPlan(kind, stage.csv, sp.update === "on") : undefined;
  const ok = plan?.items.filter((i) => !i.blocked) ?? [], blocked = plan?.items.filter((i) => i.blocked) ?? [];
  return (<div className="max-w-4xl"><h1 className="font-display text-3xl font-semibold text-forest">Import (CSV)</h1>
    {sp.done && <p role="status" className="mt-3 rounded-lg bg-sage p-3 text-sm text-forest">Import complete ({IMPORT_KINDS[(sp.kind as ImportKind) in IMPORT_KINDS ? (sp.kind as ImportKind) : "products"].label}): {sp.created} created, {sp.updated} updated, {sp.skipped} skipped.</p>}
    {sp.e && <p role="alert" className="mt-3 text-sm text-terracotta-600">{ERR[sp.e] ?? ERR["1"]}</p>}
    {!plan && <>
      <p className="mt-3 text-sm text-ink/75">Nothing is saved until you review the preview and confirm. Up to {IMPORT_ROW_LIMIT} rows per file, written in safe chunks of {IMPORT_CHUNK}. Existing rows are skipped unless you tick the update box on the preview.</p>
      <form action={previewImport} className="mt-5 grid max-w-xl gap-4 text-sm">
        <label>What are you importing?<select name="kind" className="mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2">{Object.entries(IMPORT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <input type="file" name="file" accept=".csv,text/csv" required /><button className="rounded-full bg-forest py-2.5 font-medium text-ivory">Upload and preview</button></form>
      <h2 className="mt-8 font-display text-xl font-semibold text-forest">Columns</h2>
      <ul className="mt-2 space-y-2 text-sm">{Object.entries(IMPORT_KINDS).map(([k, v]) => <li key={k}><b>{v.label}</b>: required <code>{v.required.join(", ")}</code>{v.optional.length ? <>; optional <code>{v.optional.join(", ")}</code></> : null}. <a className="underline" href={`/admin/export/${k}`}>Download current data as a template</a></li>)}</ul>
      <p className="mt-3 text-xs text-ink/60">Import brands, categories and merchants first; products and offers refer to them by slug. Dates are YYYY-MM-DD. Imported prices are stored as unverified until someone ticks “price checked”.</p></>}
    {plan && stage && <>
      <h2 className="mt-4 font-display text-xl font-semibold text-forest">Preview: {IMPORT_KINDS[kind].label}</h2>
      {plan.missingColumns.length > 0 && <p role="alert" className="mt-4 text-sm text-terracotta-600">Missing required column(s): {plan.missingColumns.join(", ")}.</p>}
      <p className="mt-2 text-sm">{ok.filter((i) => i.action === "create").length} to create · {ok.filter((i) => i.action === "update").length} to update · {plan.items.filter((i) => i.action === "skip-existing").length} existing (skipped) · {plan.errors.length + blocked.length} with problems{plan.truncated > 0 ? ` · ${plan.truncated} beyond the ${IMPORT_ROW_LIMIT}-row limit ignored` : ""}</p>
      {plan.items.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><thead><tr className="border-b border-sand"><th className="p-2">Line</th><th className="p-2">Item</th><th className="p-2">Detail</th><th className="p-2">Result</th></tr></thead>
        <tbody>{plan.items.map((i) => <tr key={i.key} className="border-b border-sand"><td className="p-2">{i.line}</td><td className="p-2">{i.label}<span className="block text-xs text-ink/60">{i.key}</span></td><td className="p-2">{i.detail}</td>
          <td className="p-2">{i.blocked ? <span className="text-terracotta-600">Blocked: {i.blocked}</span> : <span className={`rounded-full px-2 py-0.5 text-xs ${badge[i.action]}`}>{i.action === "skip-existing" ? "Exists: skipped" : i.action}</span>}</td></tr>)}</tbody></table></div>}
      {plan.errors.length > 0 && <div className="mt-4"><h3 className="font-medium text-terracotta-600">Rows that will be skipped</h3><ul className="mt-2 list-disc pl-5 text-sm">{plan.errors.map((e, n) => <li key={`${e.line}-${n}`}>Line {e.line}: {e.reason}</li>)}</ul></div>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form className="flex items-center gap-2 text-sm"><input type="hidden" name="stage" value={stage.id} /><label className="flex items-center gap-2"><input type="checkbox" name="update" defaultChecked={sp.update === "on"} />Also update rows that already exist (overwrites their fields)</label><button className="underline">Refresh preview</button></form>
        <form action={confirmImport} className="flex items-center gap-3"><input type="hidden" name="stage" value={stage.id} />{sp.update === "on" && <input type="hidden" name="update" value="on" />}<button className="rounded-full bg-forest px-6 py-2.5 text-sm font-medium text-ivory">Confirm import</button></form>
        <form action={cancelImport}><input type="hidden" name="stage" value={stage.id} /><button className="text-sm underline">Cancel</button></form></div></>}
  </div>);
}
