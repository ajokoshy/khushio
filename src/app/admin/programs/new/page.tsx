import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { getProgramFormOptions } from "@/modules/affiliate/service";
import { createProgramAction } from "../actions";
import { ProgramForm } from "../program-form";

export const metadata = { title: "New programme", robots: { index: false } };

export default async function NewProgramPage() {
  await requirePagePermission(P.affiliateWrite);
  const { merchants, networks } = await getProgramFormOptions();
  return (
    <>
      <p className="text-sm"><Link href="/admin/programs" className="text-ink-600 underline">← Programmes</Link></p>
      <h1 className="mt-2 text-3xl">New programme</h1>
      <div className="mt-6">
        <ProgramForm mode="create" action={createProgramAction} initial={{ merchantId: "", networkId: "", externalProgramId: "", commissionNote: "", isActive: true }} merchants={merchants} networks={networks} cancelHref="/admin/programs" />
      </div>
    </>
  );
}
