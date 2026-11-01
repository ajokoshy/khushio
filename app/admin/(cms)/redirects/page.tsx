import { asc, desc, ilike, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteRedirect, saveRedirect } from "../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
const ERR: Record<string, string> = { invalid: "Use paths on this site that start with /, for example /products/old-name.", reserved: "Redirects cannot start from or point to /admin, /go or /api.", same: "The old and new paths are the same." };
export default async function Redirects({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string; q?: string }> }) {
  const sp = await searchParams, q = (sp.q ?? "").trim().slice(0, 80).replace(/[%_]/g, "");
  const rows = db ? await db.select().from(schema.redirects).where(q ? or(ilike(schema.redirects.fromPath, `%${q}%`), ilike(schema.redirects.toPath, `%${q}%`)) : undefined).orderBy(desc(schema.redirects.createdAt)).limit(200) : [];
  return (<div className="max-w-3xl"><h1 className="font-display text-3xl font-semibold text-forest">Redirects</h1>
    <p className="mt-2 text-sm text-ink/70">Old addresses that should lead to a new page. Changing a product or collection slug adds one automatically. Redirects are applied when a page is not found, so they never slow down working pages.</p>
    {sp.e && <p role="alert" className="mt-3 text-sm text-terracotta-600">{ERR[sp.e] ?? "Could not save that redirect."}</p>}{sp.saved && <p role="status" className="mt-3 text-sm text-forest">Saved.</p>}
    <form action={saveRedirect} className="mt-5 grid gap-3 rounded-card border border-sand bg-white p-4 text-sm sm:grid-cols-2">
      <label>Old path<input name="from" required placeholder="/products/old-name" className={I} /></label><label>New path<input name="to" required placeholder="/products/new-name" className={I} /></label>
      <label>Type<select name="status" className={I}><option value="301">Permanent (301)</option><option value="302">Temporary (302)</option></select></label><label>Note (optional)<input name="note" maxLength={200} className={I} /></label>
      <div className="sm:col-span-2"><button className="rounded-full bg-forest px-5 py-2 text-ivory">Add redirect</button></div></form>
    <form role="search" className="mt-6 flex gap-2 text-sm"><input name="q" defaultValue={q} placeholder="Search paths" aria-label="Search redirects" className="rounded-lg border border-sand bg-white px-3 py-2" /><button className="rounded-full border border-sand bg-white px-4 py-1.5">Search</button></form>
    <ul className="mt-4 divide-y divide-sand rounded-card border border-sand bg-white">{rows.map((r) => (<li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <span><code>{r.fromPath}</code> → <code>{r.toPath}</code> <span className="text-ink/50">({r.status}{r.note ? `, ${r.note}` : ""})</span></span>
      <form action={deleteRedirect}><input type="hidden" name="id" value={r.id} /><button className="text-terracotta-600 underline">Delete</button></form></li>))}
      {!rows.length && <li className="p-3 text-sm">No redirects yet.</li>}</ul></div>);
}
