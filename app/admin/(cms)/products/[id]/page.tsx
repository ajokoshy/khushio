import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { db, schema } from "@/lib/db";
import { updateProduct } from "../../../actions";
export const dynamic = "force-dynamic";
export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { id } = await params; if (!db || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id)); if (!p) notFound();
  const [o] = await db.select().from(schema.offers).where(eq(schema.offers.productId, id));
  return (<div><h1 className="font-display text-3xl font-semibold text-forest">Edit product</h1><ProductForm action={updateProduct} error={!!(await searchParams).e} d={{ ...p, merchant: o?.merchant, url: o?.url }} /></div>);
}
