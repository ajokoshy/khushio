import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteCollection, saveCollection } from "../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
export default async function Collections({ searchParams }: { searchParams: Promise<{ edit?: string; e?: string }> }) {
  const sp = await searchParams;
  const rows = db ? await db.select().from(schema.collections).orderBy(asc(schema.collections.position)) : [];
  const prods = db ? await db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).orderBy(asc(schema.products.name)) : [];
  const cur = rows.find((r) => r.id === sp.edit);
  const picked = new Set(cur && db ? (await db.select({ p: schema.collectionProducts.productId }).from(schema.collectionProducts).where(eq(schema.collectionProducts.collectionId, cur.id))).map((r) => r.p) : []);
  return (<div className="max-w-xl"><h1 className="font-display text-3xl font-semibold text-forest">Collections</h1>
    {sp.e && <p role="alert" className="mt-3 text-sm text-terracotta-600">Enter a title.</p>}
    <ul className="mt-4 rounded-card border border-sand bg-white">{rows.map((c) => (<li key={c.id} className="flex items-center justify-between gap-3 border-b border-sand p-3 text-sm"><span>{c.position}. {c.title}</span>
      <span className="flex gap-4"><a href={`/admin/collections?edit=${c.id}`} className="underline">Edit</a><form action={deleteCollection}><input type="hidden" name="id" value={c.id} /><button className="text-terracotta-600 underline">Delete</button></form></span></li>))}</ul>
    <h2 className="mt-8 font-display text-2xl font-semibold text-forest">{cur ? `Edit: ${cur.title}` : "New collection"}</h2>
    <form key={cur?.id ?? "new"} action={saveCollection} className="mt-3 grid gap-3 text-sm"><input type="hidden" name="id" value={cur?.id ?? ""} />
      <label>Title<input name="title" required defaultValue={cur?.title} className={I} /></label><label>Slug (optional)<input name="slug" defaultValue={cur?.slug} className={I} /></label>
      <label>Description<textarea name="description" rows={3} defaultValue={cur?.description} className={I} /></label><label>Position<input name="position" type="number" defaultValue={cur?.position ?? rows.length + 1} className={I} /></label>
      <fieldset className="rounded-lg border border-sand bg-white p-3"><legend className="px-1">Products</legend><div className="grid gap-1.5 sm:grid-cols-2">{prods.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" name="products" value={p.id} defaultChecked={picked.has(p.id)} />{p.name}</label>)}</div></fieldset>
      <button className="rounded-full bg-forest py-2 text-ivory">Save collection</button></form></div>);
}
