import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "@/core/validation/money";
import { listNetworkOptions } from "@/modules/affiliate/service";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import conversions", robots: { index: false } };

export default async function ImportConversionsPage() {
  await requirePagePermission(P.importRun);
  const networks = (await listNetworkOptions()).filter((n) => n.isActive);
  return (
    <>
      <p className="text-sm"><Link href="/admin/conversions" className="text-ink-600 underline">← Conversions</Link></p>
      <h1 className="mt-2 text-3xl">Import conversions from a CSV</h1>
      <div className="mt-4 max-w-xl text-sm text-ink-600">
        <p>Download the report from your network and upload it here. The first line must name the columns. Common names are recognised:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>order id</strong> (order_id, transaction_id): required</li>
          <li><strong>commission</strong> (commission, payout, earnings): required, for example 120.50</li>
          <li><strong>date</strong> (date, order_date): required, as 2026-11-01 or 01/11/2026, in India time unless the file gives a time zone</li>
          <li><strong>status</strong> (pending, approved or confirmed, rejected or cancelled, paid): optional, default pending</li>
          <li><strong>currency</strong>: optional, default the one chosen below</li>
          <li><strong>sub_id</strong> (subid, ascsubtag): optional. The link slug that Khushio sent as {"{subid}"}; it attributes the order to that link</li>
        </ul>
        <p className="mt-2">Importing the same report again is safe: orders are matched by network and order id, so nothing is duplicated, and a newer report updates an order&apos;s status and commission.</p>
      </div>
      <div className="mt-6">
        <ImportForm networks={networks} currencies={CURRENCY_CODES} defaultCurrency={DEFAULT_CURRENCY} />
      </div>
    </>
  );
}
