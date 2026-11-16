import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { SLUG_PATTERN } from "@/core/validation/slug";
import { getLinkFormOptions } from "@/modules/affiliate/service";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { createLinkAction } from "../actions";
import { LinkForm } from "../link-form";

export const metadata = { title: "New affiliate link", robots: { index: false } };

export default async function NewLinkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.affiliateWrite);
  const { merchants } = await getLinkFormOptions();
  // ?product=<slug> comes from the product's edit screen. Anything that is not a clean slug is ignored.
  const wanted = firstParam((await searchParams).product) ?? "";
  const productSlug = SLUG_PATTERN.test(wanted) && wanted.length <= 80 ? wanted : "";

  return (
    <>
      <p className="text-sm"><Link href="/admin/links" className="text-ink-600 underline">← Affiliate links</Link></p>
      <h1 className="mt-2 text-3xl">New affiliate link</h1>
      <div className="mt-6">
        <LinkForm
          mode="create"
          action={createLinkAction}
          initial={{ merchantId: "", productSlug, destinationUrl: "", trackingParams: "", slug: "", isActive: true }}
          merchants={merchants}
          cancelHref="/admin/links"
        />
      </div>
    </>
  );
}
