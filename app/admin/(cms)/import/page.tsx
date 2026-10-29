import { eq } from "drizzle-orm";
import { buildImportPlan } from "@/lib/import-db";
import { IMPORT_ROW_LIMIT } from "@/lib/import";
import { db, schema } from "@/lib/db";
import { cancelImport, confirmImport, previewImport } from "../../actions";
export const dynamic = "force-dynamic";
type SP = { stage?: string; update?: string; done?: string; created?: string; updated?: string; skipped?: string; e?: string };
const ERR: Record<string, string> = { "1": "Choose a CSV file under 500 KB.", "2": "That upload has expired. Upload the file again.", "3": "Nothing to apply: every row was skipped or blocked. Fix the file and upload again." };
const badge = { create: "bg-sage text-forest", update: "bg-[#F6E6BD] text-[#7A5F10]", "skip-existing": "bg-sand text-ink/70" } as const;
export default async function Import({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  let stage: { id: string; csv: string } | undefined;
  if (db && sp.stage && /^[0-9a-f-]{36}$/i.test(sp.stage)) [stage] = await db.select().from(schema.importStaging).where(eq(schema.importStaging.id, sp.stage));
  const plan = stage ? await buildImportPlan(stage.csv, sp.update === "on") : undefined;
  return (<div className="max-w-4xl"><h1 className="font-display text-3xl font-semibold text-forest">Import products (CSV)</h1>
    {sp.done && <p role="status" className="mt-3 rounded-lg bg-sage p-3 text-sm text-forest">Import complete: {sp.created} created, {sp.updated} updated, {sp.skipped} skipped.</p>}
    {sp.e && <p role="alert" className="mt-3 text-sm text-terracotta-600">{ERR[sp.e] ?? ERR["1"]}</p>}
    {!plan && <>
      <p className="mt-3 text-sm text-ink/75">Columns: name, price, category and url are required; slug, brand, blurb, mrp, status (draft or published) and merchant are optional. Up to {IMPORT_ROW_LIMIT} rows per file; links must be https. Nothing is saved until you review the preview and confirm.</p>
      <form action={previewImport} className="mt-5 grid max-w-xl gap-4 text-sm"><input type="file" name="file" accept=".csv,text/csv" required /><button className="rounded-full bg-forest py-2.5 font-medium text-ivory">Upload and preview</button></form>
      <p className="mt-4 text-sm"><a className="underline" href="/admin/export/products">Download the current products CSV</a> to use as a template.</p></>}
    {plan && stage && <>
      {plan.missingColumns.length > 0 && <p role="alert" className="mt-4 text-sm text-terracotta-600">Missing required column(s): {plan.missingColumns.join(", ")}.</p>}
      <p className="mt-4 text-sm">{plan.items.filter((i) => i.action === "create" && !i.blocked).length} to create · {plan.items.filter((i) => i.action === "update" && !i.blocked).length} to update · {plan.items.filter((i) => i.action === "skip-existing").length} existing (skipped) · {plan.errors.length + plan.items.filter((i) => i.blocked).length} with problems{plan.truncated > 0 ? ` · ${plan.truncated} beyond the ${IMPORT_ROW_LIMIT}-row limit ignored` : ""}</p>
      {plan.items.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><thead><tr className="border-b border-sand"><th className="p-2">Line</th><th className="p-2">Product</th><th className="p-2">Merchant</th><th className="p-2">Price</th><th className="p-2">Result</th></tr></thead>
        <tbody>{plan.items.map((i) => <tr key={i.slug} className="border-b border-sand"><td className="p-2">{i.line}</td><td className="p-2">{i.name}<span className="block text-xs text-ink/60">{i.slug}</span></td><td className="p-2">{i.merchant}</td><td className="p-2">₹{i.price}</td>
          <td className="p-2">{i.blocked ? <span className="text-terracotta-600">Blocked: {i.blocked}</span> : <span className={`rounded-full px-2 py-0.5 text-xs ${badge[i.action]}`}>{i.action === "skip-existing" ? "Exists: skipped" : i.action}</span>}</td></tr>)}</tbody></table></div>}
      {plan.errors.length > 0 && <div className="mt-4"><h2 className="font-medium text-terracotta-600">Rows that will be skipped</h2><ul className="mt-2 list-disc pl-5 text-sm">{plan.errors.map((e) => <li key={e.line}>Line {e.line}: {e.reason}</li>)}</ul></div>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form className="flex items-center gap-2 text-sm"><input type="hidden" name="stage" value={stage.id} /><label className="flex items-center gap-2"><input type="checkbox" name="update" defaultChecked={sp.update === "on"} />Also update products that already exist (overwrites name, price, category, link)</label><button className="underline">Refresh preview</button></form>
        <form action={confirmImport} className="flex items-center gap-3"><input type="hidden" name="stage" value={stage.id} />{sp.update === "on" && <input type="hidden" name="update" value="on" />}<button className="rounded-full bg-forest px-6 py-2.5 text-sm font-medium text-ivory">Confirm import</button></form>
        <form action={cancelImport}><input type="hidden" name="stage" value={stage.id} /><button className="text-sm underline">Cancel</button></form></div></>}
  </div>);
}
