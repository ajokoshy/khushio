import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { createMerchantAction } from "../actions";
import { MerchantForm } from "../merchant-form";

export const metadata = { title: "New merchant", robots: { index: false } };

export default async function NewMerchantPage() {
  await requirePagePermission(P.merchantWrite);
  return (
    <>
      <p className="text-sm"><Link href="/admin/merchants" className="text-ink-600 underline">← Merchants</Link></p>
      <h1 className="mt-2 text-3xl">New merchant</h1>
      <div className="mt-6">
        <MerchantForm mode="create" action={createMerchantAction} initial={{ name: "", slug: "", websiteUrl: "", allowedDomains: "", logoUrl: "" }} cancelHref="/admin/merchants" />
      </div>
    </>
  );
}
