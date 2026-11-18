import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { CONTENT_STATUS_OPTIONS, editorSetup } from "@/shared/admin/content/editor-setup";
import { addEditorImageAction, getEditorUploadSignatureAction, searchEditorImagesAction } from "../../articles/actions";
import { createPageAction } from "../actions";
import { PageForm } from "../page-form";

export const metadata = { title: "New page", robots: { index: false } };

export default async function NewPagePage() {
  const session = await requirePagePermission(P.contentWrite);
  const setup = editorSetup(session.user.permissions);
  return (
    <>
      <p className="text-sm"><Link href="/admin/pages" className="text-ink-600 underline">← Pages</Link></p>
      <h1 className="mt-2 text-3xl">New page</h1>
      <div className="mt-6">
        <PageForm mode="create" action={createPageAction} statuses={CONTENT_STATUS_OPTIONS} {...setup} search={searchEditorImagesAction} sign={getEditorUploadSignatureAction} record={addEditorImageAction} cancelHref="/admin/pages"
          initial={{ title: "", slug: "", status: "DRAFT", publishAt: "", content: { type: "doc", content: [] }, seoTitle: "", seoDescription: "", seoCanonical: "", seoOgImage: "", seoRobots: "" }} />
      </div>
    </>
  );
}
