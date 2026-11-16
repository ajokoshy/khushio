import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { createNetworkAction } from "../actions";
import { NetworkForm } from "../network-form";

export const metadata = { title: "New network", robots: { index: false } };

export default async function NewNetworkPage() {
  await requirePagePermission(P.affiliateWrite);
  return (
    <>
      <p className="text-sm"><Link href="/admin/networks" className="text-ink-600 underline">← Networks</Link></p>
      <h1 className="mt-2 text-3xl">New network</h1>
      <div className="mt-6">
        <NetworkForm mode="create" action={createNetworkAction} initial={{ name: "", key: "", isActive: true }} cancelHref="/admin/networks" />
      </div>
    </>
  );
}
