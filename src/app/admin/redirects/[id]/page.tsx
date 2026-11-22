import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { getRule } from "@/modules/redirects/service";
import { idSchema } from "@/modules/redirects/validation";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { deleteRedirectAction, updateRedirectAction } from "../actions";
import { RedirectForm } from "../redirect-form";

export const metadata = { title: "Edit redirect", robots: { index: false } };

export default async function EditRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.seoWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const rule = await getRule(id).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!rule) notFound();
  return (
    <>
      <p className="text-sm"><Link href="/admin/redirects" className="text-ink-600 underline">← Redirects</Link></p>
      <h1 className="mt-2 text-3xl">Edit redirect</h1>
      <div className="mt-6">
        <RedirectForm mode="edit" action={updateRedirectAction.bind(null, id)} initial={{ fromPath: rule.fromPath, toPath: rule.toPath ?? "", statusCode: String(rule.statusCode) }} cancelHref="/admin/redirects" />
      </div>
      <section aria-labelledby="danger-heading" className="mt-10 max-w-xl border-t border-cream-200 pt-6">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <p className="mt-1 text-sm text-ink-600">The old address then answers 404 again (or shows its page, if one lives there).</p>
        <div className="mt-4"><ConfirmActionButton label="Delete" destructive title="Delete this redirect?" description="Visitors who still use the old address will see a 404 page." action={deleteRedirectAction.bind(null, id)} /></div>
      </section>
    </>
  );
}
