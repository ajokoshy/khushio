import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { idSchema } from "@/core/validation/fields";
import { formatAllowedDomains } from "@/modules/merchants/domains";
import { getMerchant } from "@/modules/merchants/service";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { StatusBadge } from "@/shared/admin/status";
import { archiveMerchantAction, deleteMerchantAction, restoreMerchantAction, updateMerchantAction } from "../actions";
import { MerchantForm } from "../merchant-form";

export const metadata = { title: "Edit merchant", robots: { index: false } };

export default async function EditMerchantPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.merchantWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  let loaded: Awaited<ReturnType<typeof getMerchant>>;
  try {
    loaded = await getMerchant(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { merchant, usage } = loaded;
  const canDelete = usage.affiliateLinks === 0 && usage.programs === 0;

  return (
    <>
      <p className="text-sm"><Link href="/admin/merchants" className="text-ink-600 underline">← Merchants</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{merchant.name}</h1>
        <StatusBadge active={merchant.isActive} />
      </div>
      <p className="mt-2 text-sm text-ink-600">
        {usage.affiliateLinks} affiliate link{usage.affiliateLinks === 1 ? "" : "s"} · {usage.programs} programme{usage.programs === 1 ? "" : "s"}
      </p>

      <div className="mt-6">
        <MerchantForm
          mode="edit"
          action={updateMerchantAction.bind(null, id)}
          initial={{
            name: merchant.name,
            slug: merchant.slug,
            websiteUrl: merchant.websiteUrl ?? "",
            allowedDomains: formatAllowedDomains(merchant.allowedDomains),
            logoUrl: merchant.logoUrl ?? "",
          }}
          cancelHref="/admin/merchants"
        />
      </div>

      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Archive or delete</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {merchant.isActive ? (
            <ConfirmActionButton
              label="Archive"
              title="Archive this merchant?"
              description="Its affiliate links stop working until you restore it. Nothing is deleted."
              action={archiveMerchantAction.bind(null, id)}
            />
          ) : (
            <ConfirmActionButton label="Restore" title="Restore this merchant?" description="Its affiliate links can be used again." action={restoreMerchantAction.bind(null, id)} />
          )}
          {canDelete && (
            <ConfirmActionButton label="Delete" destructive title="Delete this merchant?" description="This cannot be undone. No affiliate link or programme uses this merchant." action={deleteMerchantAction.bind(null, id)} />
          )}
        </div>
        {!canDelete && <p className="mt-3 text-sm text-ink-600">Delete is not available because affiliate links or programmes use this merchant. Archive it instead.</p>}
      </section>
    </>
  );
}
