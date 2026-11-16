import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { idSchema } from "@/core/validation/fields";
import { getNetwork } from "@/modules/affiliate/service";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { StatusBadge } from "@/shared/admin/status";
import { deleteNetworkAction, updateNetworkAction } from "../actions";
import { NetworkForm } from "../network-form";

export const metadata = { title: "Edit network", robots: { index: false } };

export default async function EditNetworkPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.affiliateWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  let loaded: Awaited<ReturnType<typeof getNetwork>>;
  try {
    loaded = await getNetwork(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { network, usage } = loaded;
  const canDelete = usage.programs === 0 && usage.conversions === 0;

  return (
    <>
      <p className="text-sm"><Link href="/admin/networks" className="text-ink-600 underline">← Networks</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{network.name}</h1>
        <StatusBadge active={network.isActive} />
      </div>
      <p className="mt-2 text-sm text-ink-600">
        {usage.programs} programme{usage.programs === 1 ? "" : "s"} · {usage.conversions} conversion{usage.conversions === 1 ? "" : "s"}
      </p>

      <div className="mt-6">
        <NetworkForm mode="edit" action={updateNetworkAction.bind(null, id)} initial={{ name: network.name, key: network.key, isActive: network.isActive }} cancelHref="/admin/networks" />
      </div>

      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        {canDelete ? (
          <div className="mt-4">
            <ConfirmActionButton label="Delete" destructive title="Delete this network?" description="This cannot be undone. No programme or conversion uses this network." action={deleteNetworkAction.bind(null, id)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-600">Delete is not available because programmes or conversions use this network. Untick Active instead.</p>
        )}
      </section>
    </>
  );
}
