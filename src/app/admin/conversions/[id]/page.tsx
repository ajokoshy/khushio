import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { toAdminDateTimeInput } from "@/core/validation/datetime";
import { idSchema } from "@/core/validation/fields";
import { CURRENCY_CODES, DEFAULT_CURRENCY, isCurrencyCode, minorToInput } from "@/core/validation/money";
import { listNetworkOptions } from "@/modules/affiliate/service";
import { getConversion } from "@/modules/conversions/service";
import { CONVERSION_STATUSES, CONVERSION_STATUS_LABELS } from "@/modules/conversions/types";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { deleteConversionAction, updateConversionAction } from "../actions";
import { ConversionForm } from "../conversion-form";

export const metadata = { title: "Edit conversion", robots: { index: false } };

export default async function EditConversionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.affiliateWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  let row: Awaited<ReturnType<typeof getConversion>>;
  try {
    row = await getConversion(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  // The order's own network stays selectable even if it was switched off since.
  const networks = (await listNetworkOptions()).filter((n) => n.isActive || n.id === row.networkId);
  const currency = isCurrencyCode(row.currency) ? row.currency : DEFAULT_CURRENCY;

  return (
    <>
      <p className="text-sm"><Link href="/admin/conversions" className="text-ink-600 underline">← Conversions</Link></p>
      <h1 className="mt-2 text-3xl">Order {row.externalOrderId}</h1>
      <div className="mt-6">
        <ConversionForm
          mode="edit"
          action={updateConversionAction.bind(null, id)}
          initial={{ networkId: row.networkId ?? "", externalOrderId: row.externalOrderId ?? "", linkSlug: row.linkSlug ?? "", commission: minorToInput(row.commissionMinor, currency), currency, status: row.status, convertedAt: toAdminDateTimeInput(row.convertedAt) }}
          networks={networks}
          currencies={CURRENCY_CODES}
          statuses={CONVERSION_STATUSES.map((value) => ({ value, label: CONVERSION_STATUS_LABELS[value] }))}
          cancelHref="/admin/conversions"
        />
      </div>
      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <p className="mt-2 text-sm text-ink-600">If a later CSV import still lists this order, it will be added again.</p>
        <div className="mt-4">
          <ConfirmActionButton label="Delete" destructive title="Delete this conversion?" description="This cannot be undone. The commission leaves the reports." action={deleteConversionAction.bind(null, id)} />
        </div>
      </section>
    </>
  );
}
