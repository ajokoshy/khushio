import { asc } from "drizzle-orm";
import { categoryIcons, toneClass } from "@/lib/config/site";
import { db, schema } from "@/lib/db";
import { flattenTree } from "@/lib/search-core";
import { deleteCategory, saveCategory } from "../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
export default async function Categories({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  const rows = db ? await db.select().from(schema.categories).orderBy(asc(schema.categories.position)) : [];
  const tree = flattenTree(rows);
  return (<div className="max-w-xl"><h1 className="font-display text-3xl font-semibold text-forest">Categories</h1>
    {e && <p role="alert" className="mt-3 text-sm text-terracotta-600">{({ "2": "This category still has products. Move or delete them first.", "3": "This category has sub-categories. Move or delete them first.", "4": "That parent category does not exist.", "5": "A category cannot sit under itself or one of its own sub-categories." } as Record<string, string>)[e] ?? "Check the name, icon and colour."}</p>}
    <ul className="mt-4 rounded-card border border-sand bg-white">{tree.map(({ cat: c, depth }) => (<li key={c.id} className="flex items-center justify-between gap-3 border-b border-sand p-3 text-sm"><span style={{ paddingLeft: `${depth * 1.25}rem` }}>{depth > 0 && "↳ "}{c.position}. {c.label} <span className="text-ink/50">({c.slug})</span></span>
      <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="text-terracotta-600 underline">Delete</button></form></li>))}</ul>
    <form action={saveCategory} className="mt-6 grid gap-3 text-sm"><p className="text-ink/70">Saving an existing slug updates that category (including its parent). The homepage shows categories in position order.</p>
      <label>Name<input name="label" required className={I} /></label><label>Slug (optional)<input name="slug" className={I} /></label>
      <label>Icon<select name="icon" className={I}>{categoryIcons.map((i) => <option key={i}>{i}</option>)}</select></label>
      <label>Colour<select name="tone" className={I}>{Object.keys(toneClass).map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>Parent category (optional)<select name="parent" className={I}><option value="">None (top level)</option>{tree.map(({ cat: c, depth }) => <option key={c.id} value={c.slug}>{`${"– ".repeat(depth)}${c.label}`}</option>)}</select></label>
      <label>Position<input name="position" type="number" defaultValue={rows.length + 1} className={I} /></label>
      <button className="rounded-full bg-forest py-2 text-ivory">Save category</button></form></div>);
}
