import { notFound } from "next/navigation";
import { ArticleView } from "@/components/ArticleView";
import { Alert } from "@/components/ui";
import { loadProductsBySlugs } from "@/lib/data/catalog";
import { loadArticleForPreview } from "@/lib/data/journal";
import { loadMediaMap } from "@/lib/data/media";
import { extractMediaIds, extractProductSlugs, parseMarkdown } from "@/lib/markdown";
export const dynamic = "force-dynamic";
/** The article as visitors would see it (drafts and scheduled articles included). Admin only. */
export default async function PreviewArticle({ params }: { params: Promise<{ id: string }> }) {
  const a = await loadArticleForPreview((await params).id); if (!a) notFound();
  const blocks = parseMarkdown(a.body), prods = await loadProductsBySlugs(extractProductSlugs(blocks)), media = await loadMediaMap(extractMediaIds(blocks));
  return (<div><Alert tone="warn">Preview. Visitors only see this article when it is published and its publish time has passed. <a className="underline" href="/admin/articles">Back to articles</a></Alert>
    <div className="mt-6"><ArticleView a={a} products={Object.fromEntries(prods.map((p) => [p.slug, p]))} media={media} related={[]} /></div></div>);
}
