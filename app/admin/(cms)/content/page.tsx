import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createArticle, createCoupon, createDeal, deleteContent } from "../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
const Del = ({ table, id }: { table: string; id: string }) => (<span className="flex gap-4"><a href={`/admin/content/edit/${table}/${id}`} className="text-sm underline">Edit</a><form action={deleteContent}><input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><button className="text-sm text-terracotta-600 underline">Delete</button></form></span>);
const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (<section className="mt-10"><h2 className="font-display text-2xl font-semibold text-forest">{title}</h2>{children}</section>);
export default async function Content({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const err = (await searchParams).e;
  const [ds, cs, as] = db ? await Promise.all([db.select().from(schema.deals).orderBy(desc(schema.deals.createdAt)), db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt)), db.select().from(schema.articles).orderBy(desc(schema.articles.createdAt))]) : [[], [], []];
  const li = "flex items-center justify-between gap-3 border-b border-sand p-3 text-sm";
  return (<>
    <h1 className="font-display text-3xl font-semibold text-forest">Deals, coupons and journal</h1>
    {err && <p role="alert" className="mt-3 text-sm text-terracotta-600">Missing a required field, or the link is not https://.</p>}
    <Box title="Deals"><ul className="mt-3 rounded-card border border-sand bg-white">{ds.map((r) => <li key={r.id} className={li}><span>{r.title} · {r.merchant}</span><Del table="deals" id={r.id} /></li>)}</ul>
      <form action={createDeal} className="mt-4 grid max-w-xl gap-3 text-sm"><label>Title<input name="title" required className={I} /></label><label>Merchant<input name="merchant" className={I} /></label><label>Affiliate link (https)<input name="url" type="url" required className={I} /></label><label>Ends (e.g. 2026-12-01)<input name="ends" className={I} /></label><button className="rounded-full bg-forest py-2 text-ivory">Add deal</button></form></Box>
    <Box title="Coupons"><ul className="mt-3 rounded-card border border-sand bg-white">{cs.map((r) => <li key={r.id} className={li}><span>{r.code} · {r.merchant}</span><Del table="coupons" id={r.id} /></li>)}</ul>
      <form action={createCoupon} className="mt-4 grid max-w-xl gap-3 text-sm"><label>Code<input name="code" required className={I} /></label><label>Merchant<input name="merchant" className={I} /></label><label>Details<input name="detail" className={I} /></label><label>Affiliate link (https)<input name="url" type="url" required className={I} /></label><button className="rounded-full bg-forest py-2 text-ivory">Add coupon</button></form></Box>
    <Box title="Journal articles"><ul className="mt-3 rounded-card border border-sand bg-white">{as.map((r) => <li key={r.id} className={li}><span>{r.title}</span><Del table="articles" id={r.id} /></li>)}</ul>
      <form action={createArticle} className="mt-4 grid max-w-xl gap-3 text-sm"><label>Title<input name="title" required className={I} /></label><label>URL slug (optional)<input name="slug" className={I} /></label><label>Short excerpt<input name="excerpt" className={I} /></label><label>Body (blank line between paragraphs)<textarea name="body" rows={8} required className={I} /></label><button className="rounded-full bg-forest py-2 text-ivory">Publish article</button></form></Box>
  </>);
}
