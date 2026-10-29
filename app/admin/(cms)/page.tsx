import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { bulkProducts } from "../actions";
export const dynamic = "force-dynamic";
export default async function AdminHome() {
  const rows = db ? await db.select().from(schema.products).orderBy(desc(schema.products.createdAt)) : [];
  const btn = "rounded-full border border-sand bg-white px-4 py-1.5 text-sm";
  return (<>
    {!db && <p className="mb-6 rounded-lg bg-sand p-4 text-sm">DATABASE_URL is not set, so the site is showing sample products.</p>}
    <div className="mb-4 flex items-center justify-between"><h1 className="font-display text-3xl font-semibold text-forest">Products ({rows.length})</h1>
      <a href="/admin/products/new" className="rounded-full bg-terracotta px-5 py-2 text-sm font-medium text-white">Add product</a></div>
    <form action={bulkProducts}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span>With selected:</span>
        <button name="intent" value="publish" className={btn}>Publish</button><button name="intent" value="draft" className={btn}>Unpublish</button>
        <button name="intent" value="delete" className={`${btn} text-terracotta-600`}>Delete (permanent)</button></div>
      <ul className="divide-y divide-sand rounded-card border border-sand bg-white">{rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <label className="flex items-center gap-3"><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.name}`} /><span><span className="block font-medium">{r.name}</span><span className="text-xs text-ink/60">{r.category} · ₹{r.price} · {r.status}</span></span></label>
          <a href={`/admin/products/${r.id}`} className="text-sm underline">Edit</a></li>))}</ul>
    </form></>);
}
