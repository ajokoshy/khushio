import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { idSchema } from "@/core/validation/fields";
import { getBrand } from "@/modules/discover/service";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { StatusBadge } from "@/shared/admin/status";
import { archiveBrandAction, deleteBrandAction, restoreBrandAction, updateBrandAction } from "../actions";
import { BrandForm } from "../brand-form";

export const metadata = { title: "Edit brand", robots: { index: false } };

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.brandWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  let loaded: Awaited<ReturnType<typeof getBrand>>;
  try {
    loaded = await getBrand(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { brand, products } = loaded;

  return (
    <>
      <p className="text-sm"><Link href="/admin/brands" className="text-ink-600 underline">← Brands</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{brand.name}</h1>
        <StatusBadge active={brand.isActive} />
      </div>
      <p className="mt-2 text-sm text-ink-600">{products} product{products === 1 ? "" : "s"}</p>

      <div className="mt-6">
        <BrandForm
          mode="edit"
          action={updateBrandAction.bind(null, id)}
          initial={{ name: brand.name, slug: brand.slug, description: brand.description ?? "", logoUrl: brand.logoUrl ?? "", isFeatured: brand.isFeatured }}
          cancelHref="/admin/brands"
        />
      </div>

      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Archive or delete</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {brand.isActive ? (
            <ConfirmActionButton
              label="Archive"
              title="Archive this brand?"
              description="It is hidden from shoppers. Products keep the brand and you can restore it at any time."
              action={archiveBrandAction.bind(null, id)}
            />
          ) : (
            <ConfirmActionButton label="Restore" title="Restore this brand?" description="It becomes visible again." action={restoreBrandAction.bind(null, id)} />
          )}
          {products === 0 && (
            <ConfirmActionButton label="Delete" destructive title="Delete this brand?" description="This cannot be undone. No product uses this brand." action={deleteBrandAction.bind(null, id)} />
          )}
        </div>
        {products > 0 && <p className="mt-3 text-sm text-ink-600">Delete is not available because {products} product{products === 1 ? " uses" : "s use"} this brand. Archive it instead.</p>}
      </section>
    </>
  );
}
