import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteMerchant, saveMerchant } from "../../actions";
export const dynamic = "force-dynamic";
const I = "rounded-lg border border-sand bg-white px-3 py-2";
export default async function Merchants({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  const rows = db ? await db.select({ m: schema.merchants, n: count(schema.offers.id) }).from(schema.merchants).leftJoin(schema.offers, eq(schema.offers.merchantId, schema.merchants.id)).groupBy(schema.merchants.id).orderBy(asc(schema.merchants.name)) : [];
  return (<div className="max-w-2xl"><h1 className="font-display text-3xl font-semibold text-forest">Merchants</h1>
    <p className="mt-2 text-sm text-ink/70">Merchants are created automatically when you save a product with a merchant name. Rename a merchant here to update all its offers.</p>
    {e && <p role="alert" className="mt-3 text-sm text-terracotta-600">{e === "2" ? "This merchant still has offers." : "Enter a name; the website must start with https://."}</p>}
    <ul className="mt-4 space-y-3">{rows.map(({ m, n }) => (<li key={m.id} className="rounded-card border border-sand bg-white p-4 text-sm">
      <form action={saveMerchant} className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={m.id} />
        <label>Name<input name="name" defaultValue={m.name} required className={`${I} block`} /></label><label>Website<input name="website" defaultValue={m.website} className={`${I} block`} /></label>
        <span className="text-ink/60">{n} offers</span><button className="underline">Save</button></form>
      <form action={deleteMerchant} className="mt-2"><input type="hidden" name="id" value={m.id} /><button className="text-terracotta-600 underline">Delete</button></form></li>))}</ul></div>);
}
