import Link from "next/link";
import { notFound } from "next/navigation";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { toAdminDateTimeInput } from "@/core/validation/datetime";
import { NotFoundError } from "@/core/errors";
import { ARTICLE_TYPE_LABELS } from "@/modules/content/types";
import { collectProductIds } from "@/modules/content/document";
import { getArticle, getArticleFormOptions } from "@/modules/content/service";
import { getProductNames } from "@/modules/products/service";
import { idSchema } from "@/modules/content/validation";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { ARTICLE_TYPE_OPTIONS, CONTENT_STATUS_OPTIONS, editorSetup } from "@/shared/admin/content/editor-setup";
import { addEditorImageAction, deleteArticleAction, getEditorUploadSignatureAction, searchEditorImagesAction, searchEditorProductsAction, updateArticleAction } from "../actions";
import { ArticleForm } from "../article-form";

export const metadata = { title: "Edit article", robots: { index: false } };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission(P.contentWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const found = await getArticle(id).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!found) notFound();
  const { article, tags, seo } = found;
  const [options, productLabels] = await Promise.all([getArticleFormOptions(), getProductNames(collectProductIds(article.content))]);
  const setup = editorSetup(session.user.permissions);
  const live = article.status === "PUBLISHED" || article.status === "SCHEDULED";

  return (
    <>
      <p className="text-sm"><Link href="/admin/articles" className="text-ink-600 underline">← Articles</Link></p>
      <h1 className="mt-2 text-3xl">Edit {ARTICLE_TYPE_LABELS[article.type].toLowerCase()}</h1>
      {article.status === "PUBLISHED" && <p className="mt-2 text-sm"><Link href={`/articles/${article.slug}`} className="text-coral-600 underline">View on the site</Link></p>}
      <div className="mt-6">
        <ArticleForm mode="edit" action={updateArticleAction.bind(null, id)} statuses={CONTENT_STATUS_OPTIONS} types={ARTICLE_TYPE_OPTIONS} searchProducts={searchEditorProductsAction} productLabels={productLabels} authors={options.authors} categories={options.categories.filter((c) => c.isActive || c.id === article.categoryId)} {...setup}
          search={searchEditorImagesAction} sign={getEditorUploadSignatureAction} record={addEditorImageAction} cancelHref="/admin/articles"
          initial={{ title: article.title, type: article.type, slug: article.slug, excerpt: article.excerpt ?? "", status: article.status, publishAt: toAdminDateTimeInput(article.publishAt), authorId: article.authorId ?? "", categoryId: article.categoryId ?? "", tags: tags.join(", "), coverPublicId: article.coverPublicId ?? "", coverAlt: article.coverAlt ?? "", content: article.content, seoTitle: seo.title ?? "", seoDescription: seo.description ?? "", seoCanonical: seo.canonical ?? "", seoOgImage: seo.ogImage ?? "", seoRobots: seo.robots ?? "" }} />
      </div>
      <section aria-labelledby="danger-heading" className="mt-10 max-w-3xl border-t border-cream-200 pt-6">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <p className="mt-2 text-sm text-ink-600">{live ? "A published or scheduled article can not be deleted. Set it to Archived first." : "Deleting removes the article for good. To keep a record, set the status to Archived instead."}</p>
        {!live && <div className="mt-4"><ConfirmActionButton label="Delete" destructive title="Delete this article?" description="The article is removed. This cannot be undone." action={deleteArticleAction.bind(null, id)} /></div>}
      </section>
    </>
  );
}
