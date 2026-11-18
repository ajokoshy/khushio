import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { toAdminDateTimeInput } from "@/core/validation/datetime";
import { getPage } from "@/modules/content/service";
import { idSchema } from "@/modules/content/validation";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { CONTENT_STATUS_OPTIONS, editorSetup } from "@/shared/admin/content/editor-setup";
import { addEditorImageAction, getEditorUploadSignatureAction, searchEditorImagesAction } from "../../articles/actions";
import { deletePageAction, updatePageAction } from "../actions";
import { PageForm } from "../page-form";

export const metadata = { title: "Edit page", robots: { index: false } };

export default async function EditPagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission(P.contentWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const found = await getPage(id).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!found) notFound();
  const { page, seo } = found;
  const setup = editorSetup(session.user.permissions);
  const live = page.status === "PUBLISHED" || page.status === "SCHEDULED";

  return (
    <>
      <p className="text-sm"><Link href="/admin/pages" className="text-ink-600 underline">← Pages</Link></p>
      <h1 className="mt-2 text-3xl">Edit page</h1>
      {page.status === "PUBLISHED" && <p className="mt-2 text-sm"><Link href={`/p/${page.slug}`} className="text-coral-600 underline">View on the site</Link></p>}
      <div className="mt-6">
        <PageForm mode="edit" action={updatePageAction.bind(null, id)} statuses={CONTENT_STATUS_OPTIONS} {...setup} search={searchEditorImagesAction} sign={getEditorUploadSignatureAction} record={addEditorImageAction} cancelHref="/admin/pages"
          initial={{ title: page.title, slug: page.slug, status: page.status, publishAt: toAdminDateTimeInput(page.publishAt), content: page.content, seoTitle: seo.title ?? "", seoDescription: seo.description ?? "", seoCanonical: seo.canonical ?? "", seoOgImage: seo.ogImage ?? "", seoRobots: seo.robots ?? "" }} />
      </div>
      <section aria-labelledby="danger-heading" className="mt-10 max-w-3xl border-t border-cream-200 pt-6">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <p className="mt-2 text-sm text-ink-600">{live ? "A published or scheduled page can not be deleted. Set it to Archived first." : "Deleting removes the page for good. To keep a record, set the status to Archived instead."}</p>
        {!live && <div className="mt-4"><ConfirmActionButton label="Delete" destructive title="Delete this page?" description="The page is removed. This cannot be undone." action={deletePageAction.bind(null, id)} /></div>}
      </section>
    </>
  );
}
