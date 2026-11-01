import { inArray } from "drizzle-orm";
import { ProductForm, type Dup } from "@/components/admin/ProductForm";
import { db, schema } from "@/lib/db";
import { createProduct } from "../../../actions";
export const dynamic = "force-dynamic";
type SP = { e?: string; dup?: string; name?: string; slug?: string; brand?: string; category?: string; blurb?: string; price?: string; mrp?: string; merchant?: string; url?: string; status?: string };
export default async function NewProduct({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const slugs = (sp.dup ?? "").split(",").filter(Boolean).slice(0, 10);
  const rows = db && slugs.length ? await db.select({ id: schema.products.id, slug: schema.products.slug, name: schema.products.name }).from(schema.products).where(inArray(schema.products.slug, slugs)) : [];
  const dups: Dup[] = rows.map((r) => ({ ...r, reasons: ["name, slug or link"] }));
  const d = { name: sp.name, slug: sp.slug, brand: sp.brand, category: sp.category, blurb: sp.blurb, price: sp.price ? Number(sp.price) : undefined, mrp: sp.mrp ? Number(sp.mrp) : null, merchant: sp.merchant, url: sp.url, status: sp.status };
  return (<div><h1 className="font-display text-3xl font-semibold text-forest">Add product</h1><ProductForm action={createProduct} error={sp.e} d={d} withOffer duplicates={dups} /></div>);
}
