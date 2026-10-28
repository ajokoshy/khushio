import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteProduct, toggleStatus } from "../actions";
export const dynamic = "force-dynamic";
export default async function AdminHome() {
  const rows = db ? await db.select().from(schema.products).orderBy(desc(schema.products.createdAt)) : [];
  return (<>
    {!db && <p className="mb-6 rounded-lg bg-sand p-4 text-sm">DATABASE_URL is not set, so the site is showing sample products.</p>}
    <div className="mb-4 flex items-center justify-between"><h1 className="font-display text-3xl font-semibold text-forest">Products ({rows.length})</h1>
      <a href="/admin/products/new" className="rounded-full bg-terracotta px-5 py-2 text-sm font-medium text-white">Add product</a></div>
    <ul className="divide-y divide-sand rounded-card border border-sand bg-white">{rows.map((r) => (
      <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-medium">{r.name}</p><p className="text-xs text-ink/60">{r.category} · ₹{r.price} · {r.status}</p></div>
        <div className="flex gap-4 text-sm"><a href={`/admin/products/${r.id}`} className="underline">Edit</a>
          <form action={toggleStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status} /><button className="underline">{r.status === "published" ? "Unpublish" : "Publish"}</button></form>
          <form action={deleteProduct}><input type="hidden" name="id" value={r.id} /><button className="text-terracotta-600 underline">Delete</button></form>
        </div></li>))}</ul>
  </>);
}
