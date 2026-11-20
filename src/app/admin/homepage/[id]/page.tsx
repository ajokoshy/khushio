import Link from "next/link";
import { notFound } from "next/navigation";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { NotFoundError } from "@/core/errors";
import { toAdminDateTimeInput } from "@/core/validation/datetime";
import { cloudinaryConfigured, publicCloudName } from "@/infrastructure/cloudinary";
import { formValuesFromConfig, SECTION_LABELS } from "@/modules/homepage/config";
import { getSection } from "@/modules/homepage/service";
import { idSchema } from "@/modules/homepage/validation";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { addHomepageImageAction, deleteSectionAction, getHomepageUploadSignatureAction, searchHomepageImagesAction, updateSectionAction } from "../actions";
import { loadSectionFormOptions } from "../options";
import { SectionForm } from "../section-form";

export const metadata = { title: "Edit homepage section", robots: { index: false } };

export default async function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.homepageWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const section = await getSection(id).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!section) notFound();
  const config = formValuesFromConfig(section.type, section.config);
  const options = await loadSectionFormOptions((config.c_categoryIds ?? "").split(",").filter(Boolean));
  return (
    <>
      <p className="text-sm"><Link href="/admin/homepage" className="text-ink-600 underline">← Homepage</Link></p>
      <h1 className="mt-2 text-3xl">Edit {SECTION_LABELS[section.type].toLowerCase()}</h1>
      <div className="mt-6">
        <SectionForm mode="edit" type={section.type} action={updateSectionAction.bind(null, id)} initial={{ ...config, heading: section.heading ?? "", publishAt: toAdminDateTimeInput(section.publishAt), isEnabled: section.isEnabled ? "on" : "" }} {...options}
          cloudName={publicCloudName()} uploadsEnabled={cloudinaryConfigured()} search={searchHomepageImagesAction} sign={getHomepageUploadSignatureAction} record={addHomepageImageAction} cancelHref="/admin/homepage" />
      </div>
      <section aria-labelledby="danger-heading" className="mt-10 max-w-3xl border-t border-cream-200 pt-6">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <p className="mt-2 text-sm text-ink-600">Removes this section from the homepage. To keep it for later, switch it off instead.</p>
        <div className="mt-4"><ConfirmActionButton label="Delete" destructive title="Delete this section?" description="It disappears from the homepage. This cannot be undone." action={deleteSectionAction.bind(null, id)} /></div>
      </section>
    </>
  );
}
