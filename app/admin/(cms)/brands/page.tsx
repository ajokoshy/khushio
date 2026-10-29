import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteBrand, saveBrand } from "../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
export default async function Brands() {
  const rows = db ? await db.select().from(schema.brands).orderBy(asc(schema.brands.name)) : [];
  return (<div className="max-w-xl"><h1 className="font-display text-3xl font-semibold text-forest">Brands</h1>
    <ul className="mt-4 rounded-card border border-sand bg-white">{rows.map((b) => (<li key={b.id} className="flex items-center justify-between gap-3 border-b border-sand p-3 text-sm"><span>{b.name} <span className="text-ink/50">({b.slug})</span></span>
      <form action={deleteBrand}><input type="hidden" name="id" value={b.id} /><button className="text-terracotta-600 underline">Delete</button></form></li>))}</ul>
    <form action={saveBrand} className="mt-6 grid gap-3 text-sm"><p className="text-ink/70">Saving an existing slug updates that brand. Use the same slug in a product's brand field.</p>
      <label>Name<input name="name" required className={I} /></label><label>Slug (optional)<input name="slug" className={I} /></label><label>About<textarea name="about" rows={3} className={I} /></label>
      <button className="rounded-full bg-forest py-2 text-ivory">Save brand</button></form></div>);
}
