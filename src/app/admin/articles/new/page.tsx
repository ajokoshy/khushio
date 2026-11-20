import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { getArticleFormOptions } from "@/modules/content/service";
import { ARTICLE_TYPE_OPTIONS, CONTENT_STATUS_OPTIONS, editorSetup } from "@/shared/admin/content/editor-setup";
import { addEditorImageAction, createArticleAction, getEditorUploadSignatureAction, searchEditorImagesAction, searchEditorProductsAction } from "../actions";
import { ArticleForm } from "../article-form";

export const metadata = { title: "New article", robots: { index: false } };

export default async function NewArticlePage() {
  const session = await requirePagePermission(P.contentWrite);
  const [options, setup] = await Promise.all([getArticleFormOptions(), Promise.resolve(editorSetup(session.user.permissions))]);
  return (
    <>
      <p className="text-sm"><Link href="/admin/articles" className="text-ink-600 underline">← Articles</Link></p>
      <h1 className="mt-2 text-3xl">New article or guide</h1>
      <div className="mt-6">
        <ArticleForm mode="create" action={createArticleAction} statuses={CONTENT_STATUS_OPTIONS} types={ARTICLE_TYPE_OPTIONS} searchProducts={searchEditorProductsAction} productLabels={{}} authors={options.authors} categories={options.categories.filter((c) => c.isActive)} {...setup}
          search={searchEditorImagesAction} sign={getEditorUploadSignatureAction} record={addEditorImageAction} cancelHref="/admin/articles"
          initial={{ title: "", type: "article", slug: "", excerpt: "", status: "DRAFT", publishAt: "", authorId: "", categoryId: "", tags: "", coverPublicId: "", coverAlt: "", content: { type: "doc", content: [] }, seoTitle: "", seoDescription: "", seoCanonical: "", seoOgImage: "", seoRobots: "" }} />
      </div>
    </>
  );
}
