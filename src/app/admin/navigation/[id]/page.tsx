import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { getItem } from "@/modules/navigation/service";
import { idSchema } from "@/modules/navigation/validation";
import { NAV_AREA_LABELS } from "@/modules/navigation/types";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { deleteNavItemAction, updateNavItemAction } from "../actions";
import { NavForm } from "../nav-form";

export const metadata = { title: "Edit link", robots: { index: false } };

export default async function EditNavItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.homepageWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const item = await getItem(id).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!item) notFound();
  return (
    <>
      <p className="text-sm"><Link href="/admin/navigation" className="text-ink-600 underline">← Navigation</Link></p>
      <h1 className="mt-2 text-3xl">Edit link</h1>
      <p className="mt-1 text-sm text-ink-600">{NAV_AREA_LABELS[item.area]}</p>
      <div className="mt-6">
        <NavForm mode="edit" action={updateNavItemAction.bind(null, id)} initial={{ area: item.area, label: item.label, href: item.href, isActive: item.isActive }} areas={[]} cancelHref="/admin/navigation" />
      </div>
      <section aria-labelledby="danger-heading" className="mt-10 max-w-xl border-t border-cream-200 pt-6">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <div className="mt-4"><ConfirmActionButton label="Delete" destructive title="Delete this link?" description="It disappears from the site. This cannot be undone." action={deleteNavItemAction.bind(null, id)} /></div>
      </section>
    </>
  );
}
