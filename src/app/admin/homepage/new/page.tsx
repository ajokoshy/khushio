import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { cloudinaryConfigured, publicCloudName } from "@/infrastructure/cloudinary";
import { isSectionType, SECTION_LABELS, SECTION_TYPES, STARTING_CONFIG, formValuesFromConfig } from "@/modules/homepage/config";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { addHomepageImageAction, createSectionAction, getHomepageUploadSignatureAction, searchHomepageImagesAction } from "../actions";
import { loadSectionFormOptions } from "../options";
import { SectionForm } from "../section-form";

export const metadata = { title: "Add homepage section", robots: { index: false } };

export default async function NewSectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.homepageWrite);
  const type = firstParam((await searchParams).type) ?? "";
  if (!isSectionType(type)) {
    return (
      <>
        <p className="text-sm"><Link href="/admin/homepage" className="text-ink-600 underline">← Homepage</Link></p>
        <h1 className="mt-2 text-3xl">Add a section</h1>
        <ul className="mt-4 flex flex-wrap gap-2">{SECTION_TYPES.map((t) => <li key={t}><Link href={`/admin/homepage/new?type=${t}`} className="rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100">{SECTION_LABELS[t]}</Link></li>)}</ul>
      </>
    );
  }
  const options = await loadSectionFormOptions();
  return (
    <>
      <p className="text-sm"><Link href="/admin/homepage" className="text-ink-600 underline">← Homepage</Link></p>
      <h1 className="mt-2 text-3xl">Add {SECTION_LABELS[type].toLowerCase()}</h1>
      <div className="mt-6">
        <SectionForm mode="create" type={type} action={createSectionAction} initial={{ ...formValuesFromConfig(type, STARTING_CONFIG[type]), heading: "", publishAt: "", isEnabled: "on" }} {...options}
          cloudName={publicCloudName()} uploadsEnabled={cloudinaryConfigured()} search={searchHomepageImagesAction} sign={getHomepageUploadSignatureAction} record={addHomepageImageAction} cancelHref="/admin/homepage" />
      </div>
    </>
  );
}
