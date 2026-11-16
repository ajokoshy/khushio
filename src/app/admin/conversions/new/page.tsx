import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "@/core/validation/money";
import { toAdminDateTimeInput } from "@/core/validation/datetime";
import { listNetworkOptions } from "@/modules/affiliate/service";
import { CONVERSION_STATUSES, CONVERSION_STATUS_LABELS } from "@/modules/conversions/types";
import { createConversionAction } from "../actions";
import { ConversionForm } from "../conversion-form";

export const metadata = { title: "Add conversion", robots: { index: false } };

export default async function NewConversionPage() {
  await requirePagePermission(P.affiliateWrite);
  const networks = (await listNetworkOptions()).filter((n) => n.isActive);
  return (
    <>
      <p className="text-sm"><Link href="/admin/conversions" className="text-ink-600 underline">← Conversions</Link></p>
      <h1 className="mt-2 text-3xl">Add a conversion</h1>
      <div className="mt-6">
        <ConversionForm
          mode="create"
          action={createConversionAction}
          initial={{ networkId: "", externalOrderId: "", linkSlug: "", commission: "", currency: DEFAULT_CURRENCY, status: "pending", convertedAt: toAdminDateTimeInput(new Date()) }}
          networks={networks}
          currencies={CURRENCY_CODES}
          statuses={CONVERSION_STATUSES.map((value) => ({ value, label: CONVERSION_STATUS_LABELS[value] }))}
          cancelHref="/admin/conversions"
        />
      </div>
    </>
  );
}
