import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteMerchant, saveMerchant } from "../../actions";
export const dynamic = "force-dynamic";
const I = "rounded-lg border border-sand bg-white px-3 py-2";
export default async function Merchants({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  const rows = db ? await db.select({ m: schema.merchants, n: count(schema.offers.id) }).from(schema.merchants).leftJoin(schema.offers, eq(schema.offers.merchantId, schema.merchants.id)).groupBy(schema.merchants.id).orderBy(asc(schema.merchants.name)) : [];
  return (<div className="max-w-2xl"><h1 className="font-display text-3xl font-semibold text-forest">Merchants</h1>
    <p className="mt-2 text-sm text-ink/70">Merchants are created automatically when you save a product with a merchant name. Rename a merchant here to update all its offers. Approved link domains (comma separated) limit where its affiliate links may point, including tracking domains such as amzn.to; links to other hosts are rejected when saved and again when followed. Unchecking Active hides all its offers.</p>
    {e && <p role="alert" className="mt-3 text-sm text-terracotta-600">{e === "2" ? "This merchant still has offers." : "Enter a name; the website must start with https://."}</p>}
    <ul className="mt-4 space-y-3">{rows.map(({ m, n }) => (<li key={m.id} className="rounded-card border border-sand bg-white p-4 text-sm">
      <form action={saveMerchant} className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={m.id} />
        <label>Name<input name="name" defaultValue={m.name} required className={`${I} block`} /></label><label>Website<input name="website" defaultValue={m.website} className={`${I} block`} /></label><label>Approved link domains<input name="approved_domains" defaultValue={m.approvedDomains} placeholder="amazon.in, amzn.to" className={`${I} block`} /></label><label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={m.isActive} />Active</label>
        <span className="text-ink/60">{n} offers{!m.approvedDomains && !m.website ? " · links not domain-checked" : ""}</span><button className="underline">Save</button></form>
      <form action={deleteMerchant} className="mt-2"><input type="hidden" name="id" value={m.id} /><button className="text-terracotta-600 underline">Delete</button></form></li>))}</ul></div>);
}
