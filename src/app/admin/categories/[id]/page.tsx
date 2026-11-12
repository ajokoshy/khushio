import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { idSchema } from "@/core/validation/fields";
import { getCategory, listParentOptions } from "@/modules/discover/service";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { StatusBadge } from "@/shared/admin/status";
import { archiveCategoryAction, deleteCategoryAction, restoreCategoryAction, updateCategoryAction } from "../actions";
import { CategoryForm } from "../category-form";

export const metadata = { title: "Edit category", robots: { index: false } };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.categoryWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  let loaded: Awaited<ReturnType<typeof getCategory>>;
  try {
    loaded = await getCategory(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { category, usage } = loaded;
  const parentOptions = await listParentOptions({ excludeId: id, currentParentId: category.parentId });
  const canDelete = usage.children === 0 && usage.products === 0;

  return (
    <>
      <p className="text-sm"><Link href="/admin/categories" className="text-ink-600 underline">← Categories</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{category.name}</h1>
        <StatusBadge active={category.isActive} />
      </div>
      <p className="mt-2 text-sm text-ink-600">
        {usage.children} subcategor{usage.children === 1 ? "y" : "ies"} · {usage.products} product{usage.products === 1 ? "" : "s"}
      </p>

      <div className="mt-6">
        <CategoryForm
          mode="edit"
          action={updateCategoryAction.bind(null, id)}
          initial={{ name: category.name, slug: category.slug, parentId: category.parentId ?? "", description: category.description ?? "", sortOrder: category.sortOrder }}
          parentOptions={parentOptions}
          cancelHref="/admin/categories"
        />
      </div>

      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Archive or delete</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {category.isActive ? (
            <ConfirmActionButton
              label="Archive"
              title="Archive this category?"
              description="It is hidden from shoppers and from the parent picker. Products keep their link to it and you can restore it at any time."
              action={archiveCategoryAction.bind(null, id)}
            />
          ) : (
            <ConfirmActionButton label="Restore" title="Restore this category?" description="It becomes visible again." action={restoreCategoryAction.bind(null, id)} />
          )}
          {canDelete && (
            <ConfirmActionButton
              label="Delete"
              destructive
              title="Delete this category?"
              description="This cannot be undone. Nothing uses this category."
              action={deleteCategoryAction.bind(null, id)}
            />
          )}
        </div>
        {!canDelete && (
          <p className="mt-3 text-sm text-ink-600">
            Delete is not available because this category still has {usage.children > 0 ? "subcategories" : "products"}
            {usage.children > 0 && usage.products > 0 ? " and products" : ""}. Archive it instead.
          </p>
        )}
        {category.isActive && usage.activeChildren > 0 && (
          <p className="mt-3 text-sm text-ink-600">To archive it, first archive or move its {usage.activeChildren} active subcategor{usage.activeChildren === 1 ? "y" : "ies"}.</p>
        )}
      </section>
    </>
  );
}
