import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { idSchema } from "@/core/validation/fields";
import { listParentOptions } from "@/modules/discover/service";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { CategoryForm } from "../category-form";
import { createCategoryAction } from "../actions";

export const metadata = { title: "New category", robots: { index: false } };

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.categoryWrite);
  const sp = await searchParams;
  const parentOptions = await listParentOptions();
  // ?parent=<id> comes from "Add subcategory"; ignored unless it is one of the listed options.
  const requested = idSchema.safeParse(firstParam(sp.parent));
  const parentId = requested.success && parentOptions.some((o) => o.id === requested.data) ? requested.data : "";

  return (
    <>
      <p className="text-sm"><Link href="/admin/categories" className="text-ink-600 underline">← Categories</Link></p>
      <h1 className="mt-2 text-3xl">New category</h1>
      <div className="mt-6">
        <CategoryForm
          mode="create"
          action={createCategoryAction}
          initial={{ name: "", slug: "", parentId, description: "", sortOrder: 0 }}
          parentOptions={parentOptions}
          cancelHref="/admin/categories"
        />
      </div>
    </>
  );
}
