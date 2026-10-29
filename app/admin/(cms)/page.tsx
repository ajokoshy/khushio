import { and, count, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { bulkProducts } from "../actions";
export const dynamic = "force-dynamic";
const PAGE = 25;
type SP = { q?: string; status?: string; page?: string };
const STATUSES = ["published", "draft", "archived"] as const;
export default async function AdminHome({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams, q = (sp.q ?? "").trim().slice(0, 80), status = STATUSES.find((s) => s === sp.status), page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const where = and(status ? eq(schema.products.status, status) : ne(schema.products.status, "archived"), q ? or(ilike(schema.products.name, `%${q.replace(/[%_]/g, "")}%`), ilike(schema.products.slug, `%${q.replace(/[%_]/g, "")}%`)) : undefined);
  const [total, rows] = db ? await Promise.all([db.select({ n: count() }).from(schema.products).where(where).then((r) => r[0].n), db.select().from(schema.products).where(where).orderBy(desc(schema.products.createdAt)).limit(PAGE).offset((page - 1) * PAGE)]) : [0, []];
  const pages = Math.max(1, Math.ceil(total / PAGE)), link = (p: number) => `/admin?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), page: String(p) })}`;
  const btn = "rounded-full border border-sand bg-white px-4 py-1.5 text-sm", I = "rounded-lg border border-sand bg-white px-3 py-2 text-sm";
  return (<>
    {!db && <p className="mb-6 rounded-lg bg-sand p-4 text-sm">DATABASE_URL is not set. In production the public site shows no catalogue until it is.</p>}
    <div className="mb-4 flex items-center justify-between"><h1 className="font-display text-3xl font-semibold text-forest">Products ({total})</h1>
      <a href="/admin/products/new" className="rounded-full bg-terracotta px-5 py-2 text-sm font-medium text-white">Add product</a></div>
    <form role="search" className="mb-4 flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Search name or slug" aria-label="Search products" className={I} />
      <select name="status" defaultValue={status ?? ""} aria-label="Status" className={I}><option value="">Active (published and draft)</option>{STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select><button className={btn}>Filter</button></form>
    <form action={bulkProducts}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span>With selected:</span>
        <button name="intent" value="publish" className={btn}>Publish</button><button name="intent" value="draft" className={btn}>Unpublish</button>
        <button name="intent" value="archive" className={btn}>Archive</button><button name="intent" value="restore" className={btn}>Restore as draft</button></div>
      <ul className="divide-y divide-sand rounded-card border border-sand bg-white">{rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <label className="flex items-center gap-3"><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.name}`} /><span><span className="block font-medium">{r.name}</span><span className="text-xs text-ink/60">{r.category} · ₹{r.price} · <b>{r.status}</b>{r.featured ? " · featured" : ""}</span></span></label>
          <a href={`/admin/products/${r.id}`} className="text-sm underline">Edit</a></li>))}
        {!rows.length && <li className="p-4 text-sm">No products match.</li>}</ul>
    </form>
    {pages > 1 && <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">{page > 1 && <a className="underline" href={link(page - 1)}>Previous</a>}<span>Page {page} of {pages}</span>{page < pages && <a className="underline" href={link(page + 1)}>Next</a>}</nav>}
  </>);
}
