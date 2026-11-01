import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { findDuplicates } from "@/lib/duplicates-db";
import { db, schema } from "@/lib/db";
import { saveOffer, updateProduct } from "../../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
const ymd = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : "");
const OFFER_ERR: Record<string, string> = { "1": "Enter a merchant and an https:// link. A price must be positive, MRP higher than the price, and dates valid.", "2": "That link is not on this merchant’s approved domains. Add the domain on the Merchants page first." };
export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; o?: string; saved?: string }> }) {
  const { id } = await params, sp = await searchParams; if (!db || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id)); if (!p) notFound();
  const offers = await db.select().from(schema.offers).where(eq(schema.offers.productId, id)).orderBy(asc(schema.offers.createdAt));
  const now = Date.now();
  const dups = (await findDuplicates({ name: p.name, slug: p.slug, urls: offers.map((o) => o.url), excludeId: id })).map((x) => ({ ...x, reasons: x.reasons as string[] }));
  const OfferForm = ({ o }: { o?: (typeof offers)[number] }) => (
    <form action={saveOffer} className="grid gap-3 rounded-card border border-sand bg-white p-4 text-sm sm:grid-cols-2">
      <input type="hidden" name="product_id" value={id} />{o && <input type="hidden" name="id" value={o.id} />}
      <label>Merchant<input name="merchant" required defaultValue={o?.merchant} className={I} /></label>
      <label>Affiliate link (https)<input name="url" type="url" required defaultValue={o?.url} className={I} /></label>
      <label>Price (₹, optional)<input name="price" type="number" min={1} defaultValue={o?.price ?? ""} className={I} /></label>
      <label>MRP (₹, optional)<input name="mrp" type="number" min={1} defaultValue={o?.mrp ?? ""} className={I} /></label>
      <label>Offer ends (optional)<input name="expires" type="date" defaultValue={ymd(o?.expiresAt ?? null)} className={I} /></label>
      <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={o ? o.isActive : true} />Active (shown and followable)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="price_checked" />I checked this price just now{o?.priceCheckedAt ? ` (last: ${o.priceCheckedAt.toISOString().slice(0, 10)})` : ""}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="verified" />I checked this link just now{o?.lastVerifiedAt ? ` (last: ${o.lastVerifiedAt.toISOString().slice(0, 10)})` : ""}</label></div>
      <div className="sm:col-span-2 flex items-center gap-3"><button className="rounded-full bg-forest px-5 py-2 text-ivory">{o ? "Save offer" : "Add offer"}</button>
        {o && (!o.isActive ? <span className="text-ink/60">Inactive</span> : o.expiresAt && o.expiresAt.getTime() < now ? <span className="text-terracotta-600">Expired: hidden from visitors</span> : <span className="text-forest">Live</span>)}</div>
    </form>);
  return (<div className="max-w-3xl"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-semibold text-forest">Edit product</h1><a className="rounded-full border border-sand bg-white px-4 py-1.5 text-sm underline" href={`/admin/preview/${id}`}>Preview as visitors see it</a></div>
    {sp.saved && <p role="status" className="mt-3 text-sm text-forest">Saved.</p>}
    {p.status === "archived" && <p className="mt-3 rounded-lg bg-sand p-3 text-sm">This product is archived and hidden. Restore it from the product list.</p>}
    <ProductForm action={updateProduct} error={sp.e} d={p} duplicates={dups} />
    <h2 className="mt-12 font-display text-2xl font-semibold text-forest">Retailer offers</h2>
    <p className="mt-1 text-sm text-ink/70">A product can have several retailers. Visitors only see active offers that have not ended.</p>
    {sp.o && <p role="alert" className="mt-3 text-sm text-terracotta-600">{OFFER_ERR[sp.o] ?? OFFER_ERR["1"]}</p>}
    <div className="mt-4 space-y-4">{offers.map((o) => <OfferForm key={o.id} o={o} />)}</div>
    <h3 className="mb-3 mt-8 font-medium text-forest">Add another retailer</h3><OfferForm /></div>);
}
