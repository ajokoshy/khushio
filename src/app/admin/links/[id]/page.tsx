import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { idSchema } from "@/core/validation/fields";
import { getLink, getLinkFormOptions } from "@/modules/affiliate/service";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { StatusBadge } from "@/shared/admin/status";
import { deleteLinkAction, updateLinkAction, verifyLinkAction } from "../actions";
import { LinkForm } from "../link-form";

export const metadata = { title: "Edit affiliate link", robots: { index: false } };

export default async function EditLinkPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.affiliateWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  let loaded: Awaited<ReturnType<typeof getLink>>;
  try {
    loaded = await getLink(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { link, history } = loaded;
  const { merchants } = await getLinkFormOptions();
  const canDelete = history.clicks === 0 && history.dailyRows === 0 && history.conversions === 0;

  return (
    <>
      <p className="text-sm"><Link href="/admin/links" className="text-ink-600 underline">← Affiliate links</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{link.slug}</h1>
        <StatusBadge active={link.isActive} />
      </div>
      <p className="mt-2 text-sm text-ink-600">
        Public address: <code>/go/{link.slug}</code> · Last checked: {link.lastVerifiedAt ? formatAdminDateTime(link.lastVerifiedAt) : "never"}
      </p>
      {link.problem && <p role="alert" className="mt-4 max-w-xl rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">Visitors cannot use this link right now: {link.problem}</p>}
      {!link.merchantActive && <p role="alert" className="mt-4 max-w-xl rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">The merchant {link.merchantName} is archived, so this link answers 404 until you restore the merchant.</p>}

      <div className="mt-6">
        <LinkForm
          mode="edit"
          action={updateLinkAction.bind(null, id)}
          initial={{ merchantId: link.merchantId, productSlug: link.productSlug ?? "", destinationUrl: link.destinationUrl, trackingParams: link.trackingParams ?? "", slug: link.slug, isActive: link.isActive }}
          merchants={merchants}
          cancelHref="/admin/links"
        />
      </div>

      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="check-heading">
        <h2 id="check-heading" className="text-xl">Check the destination</h2>
        <p className="mt-2 text-sm text-ink-600">Sends one request to the store and records the result. Stores that block automatic checks are reported as unclear; open the link in a browser to be sure.</p>
        <div className="mt-4">
          <ConfirmActionButton label="Check now" title="Check this link?" description="One request is sent to the store's page, without your tracking parameters." confirmLabel="Check" action={verifyLinkAction.bind(null, id)} />
        </div>
      </section>

      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        {canDelete ? (
          <div className="mt-4">
            <ConfirmActionButton label="Delete" destructive title="Delete this link?" description="This cannot be undone. The link has no clicks or conversions yet." action={deleteLinkAction.bind(null, id)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-600">Delete is not available because this link has click or conversion history that the reports use. Untick Active instead.</p>
        )}
      </section>
    </>
  );
}
