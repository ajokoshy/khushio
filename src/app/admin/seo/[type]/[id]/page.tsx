import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { getEntity } from "@/modules/seo/service";
import { AUDIT_TYPE_SINGULAR, isOverrideType } from "@/modules/seo/types";
import { idSchema } from "@/modules/seo/validation";
import { saveSeoAction } from "../../actions";
import { SeoForm } from "../../seo-form";

export const metadata = { title: "Search text", robots: { index: false } };

export default async function EditSeoPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  await requirePagePermission(P.seoWrite);
  const { type, id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!isOverrideType(type) || !parsed.success) notFound();
  const found = await getEntity(type, parsed.data).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!found) notFound();
  const { entity, seo } = found;
  return (
    <>
      <p className="text-sm"><Link href={`/admin/seo?type=${type}`} className="text-ink-600 underline">← Search (SEO)</Link></p>
      <h1 className="mt-2 text-3xl">{entity.name}</h1>
      <p className="mt-1 text-sm text-ink-600">{AUDIT_TYPE_SINGULAR[type]} · <code>{entity.path}</code></p>
      <p className="mt-3 max-w-prose text-sm text-ink-600">What search engines and shared links show for this page. Anything left empty uses the page&apos;s own name and text. Changes show within about 30 minutes, or sooner after the next page rebuild.</p>
      <div className="mt-6">
        <SeoForm action={saveSeoAction.bind(null, type, parsed.data)} initial={{ seoTitle: seo?.title ?? "", seoDescription: seo?.description ?? "", seoCanonical: seo?.canonical ?? "", seoOgImage: seo?.ogImage ?? "", seoRobots: seo?.robots ?? "" }} />
      </div>
    </>
  );
}
