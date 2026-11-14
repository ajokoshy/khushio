import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { hasPermission } from "@/core/permissions/guard";
import { requirePagePermission } from "@/core/permissions/require";
import { DEFAULT_CURRENCY } from "@/core/validation/money";
import { listBrandOptions, listCategoryChoices } from "@/modules/discover/service";
import { createProductAction } from "../actions";
import { ProductForm, type ProductFormValues } from "../product-form";

export const metadata = { title: "New product", robots: { index: false } };

const blank: ProductFormValues = {
  name: "", slug: "", summary: "", description: "", brandId: "", status: "DRAFT", publishAt: "", isFeatured: false,
  primaryCategoryId: "", categoryIds: [], tags: "", attributes: [], variants: [{ id: "", label: "", sku: "", price: "", currency: DEFAULT_CURRENCY }],
};

export default async function NewProductPage() {
  const session = await requirePagePermission(P.productWrite);
  const [brands, categories] = await Promise.all([listBrandOptions(), listCategoryChoices()]);
  return (
    <>
      <p className="text-sm"><Link href="/admin/products" className="text-ink-600 underline">← Products</Link></p>
      <h1 className="mt-2 text-3xl">New product</h1>
      <div className="mt-6">
        <ProductForm
          mode="create"
          action={createProductAction}
          initial={blank}
          brands={brands.map((b) => ({ id: b.id, label: b.name }))}
          categories={categories}
          canPublish={hasPermission(session.user.permissions, P.productPublish)}
          cancelHref="/admin/products"
        />
      </div>
    </>
  );
}
