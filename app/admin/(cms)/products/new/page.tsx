import { ProductForm } from "@/components/admin/ProductForm";
import { createProduct } from "../../../actions";
export default async function NewProduct({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  return (<div><h1 className="font-display text-3xl font-semibold text-forest">Add product</h1><ProductForm action={createProduct} error={e} /></div>);
}
