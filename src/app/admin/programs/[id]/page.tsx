import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { idSchema } from "@/core/validation/fields";
import { getProgram, getProgramFormOptions } from "@/modules/affiliate/service";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { StatusBadge } from "@/shared/admin/status";
import { deleteProgramAction, updateProgramAction } from "../actions";
import { ProgramForm } from "../program-form";

export const metadata = { title: "Edit programme", robots: { index: false } };

export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.affiliateWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  let program: Awaited<ReturnType<typeof getProgram>>;
  try {
    program = await getProgram(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { merchants, networks } = await getProgramFormOptions();

  return (
    <>
      <p className="text-sm"><Link href="/admin/programs" className="text-ink-600 underline">← Programmes</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{program.merchantName} on {program.networkName}</h1>
        <StatusBadge active={program.isActive} />
      </div>

      <div className="mt-6">
        <ProgramForm
          mode="edit"
          action={updateProgramAction.bind(null, id)}
          initial={{ merchantId: program.merchantId, networkId: program.networkId, externalProgramId: program.externalProgramId ?? "", commissionNote: program.commissionNote ?? "", isActive: program.isActive }}
          merchants={merchants}
          networks={networks}
          cancelHref="/admin/programs"
        />
      </div>

      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <div className="mt-4">
          <ConfirmActionButton label="Delete" destructive title="Delete this programme?" description="This cannot be undone. Affiliate links and conversions are not affected." action={deleteProgramAction.bind(null, id)} />
        </div>
      </section>
    </>
  );
}
