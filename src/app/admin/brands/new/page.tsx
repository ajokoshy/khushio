import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { createBrandAction } from "../actions";
import { BrandForm } from "../brand-form";

export const metadata = { title: "New brand", robots: { index: false } };

export default async function NewBrandPage() {
  await requirePagePermission(P.brandWrite);
  return (
    <>
      <p className="text-sm"><Link href="/admin/brands" className="text-ink-600 underline">← Brands</Link></p>
      <h1 className="mt-2 text-3xl">New brand</h1>
      <div className="mt-6">
        <BrandForm mode="create" action={createBrandAction} initial={{ name: "", slug: "", description: "", logoUrl: "", isFeatured: false }} cancelHref="/admin/brands" />
      </div>
    </>
  );
}
