import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { updateArticle, updateCoupon, updateDeal } from "../../../../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
const Btn = () => <button className="rounded-full bg-forest py-2 text-ivory">Save changes</button>;
export default async function EditContent({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const wrap = (t: string, form: React.ReactNode) => <div className="max-w-xl"><h1 className="font-display text-3xl font-semibold text-forest">{t}</h1>{form}</div>;
  const cls = "mt-6 grid gap-3 text-sm";
  if (table === "deals") { const [r] = await db.select().from(schema.deals).where(eq(schema.deals.id, id)); if (!r) notFound();
    return wrap("Edit deal", <form action={updateDeal} className={cls}><input type="hidden" name="id" value={r.id} /><label>Title<input name="title" required defaultValue={r.title} className={I} /></label><label>Merchant<input name="merchant" defaultValue={r.merchant} className={I} /></label><label>Affiliate link (https)<input name="url" type="url" required defaultValue={r.url} className={I} /></label><label>Ends<input name="ends" defaultValue={r.ends} className={I} /></label><Btn /></form>); }
  if (table === "coupons") { const [r] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, id)); if (!r) notFound();
    return wrap("Edit coupon", <form action={updateCoupon} className={cls}><input type="hidden" name="id" value={r.id} /><label>Code<input name="code" required defaultValue={r.code} className={I} /></label><label>Merchant<input name="merchant" defaultValue={r.merchant} className={I} /></label><label>Details<input name="detail" defaultValue={r.detail} className={I} /></label><label>Affiliate link (https)<input name="url" type="url" required defaultValue={r.url} className={I} /></label><Btn /></form>); }
  if (table === "articles") { const [r] = await db.select().from(schema.articles).where(eq(schema.articles.id, id)); if (!r) notFound();
    return wrap("Edit article", <form action={updateArticle} className={cls}><input type="hidden" name="id" value={r.id} /><label>Title<input name="title" required defaultValue={r.title} className={I} /></label><label>URL slug<input name="slug" defaultValue={r.slug} className={I} /></label><label>Short excerpt<input name="excerpt" defaultValue={r.excerpt} className={I} /></label><label>Body (blank line between paragraphs)<textarea name="body" rows={10} required defaultValue={r.body} className={I} /></label><Btn /></form>); }
  notFound();
}
