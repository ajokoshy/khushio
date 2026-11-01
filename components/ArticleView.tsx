import { ArticleCard, fmtDate } from "@/components/ArticleCard";
import { Img } from "@/components/Img";
import { Prose, type ProseMedia } from "@/components/Prose";
import { Grid } from "@/components/ProductCard";
import type { Product } from "@/lib/data/catalog";
import type { JournalArticle, JournalCard } from "@/lib/data/journal";
import { headings, parseMarkdown } from "@/lib/markdown";

/** Article body, contents list, tags and related reading. Shared by the public page and the admin preview. */
export function ArticleView({ a, products, media, related }: { a: JournalArticle; products: Record<string, Product>; media: ProseMedia; related: JournalCard[] }) {
  const blocks = parseMarkdown(a.body), toc = headings(blocks).filter((h) => h.level <= 3);
  return (
    <>
      <header className="max-w-2xl">
        <p className="text-sm text-ink/60">{a.category && <a className="font-medium text-terracotta underline" href={`/journal/${a.category.slug}`}>{a.category.name}</a>}{a.category && " · "}{fmtDate(a.publishedAt)} · {a.readMinutes} min read{a.author && ` · By ${a.author}`}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest">{a.title}</h1>
        {a.excerpt && <p className="mt-3 text-lg text-ink/75">{a.excerpt}</p>}
      </header>
      {a.cover && <Img src={a.cover.publicId} alt={a.cover.alt} width={1280} height={a.cover.width && a.cover.height ? Math.round((1280 * a.cover.height) / a.cover.width) : 720} originalWidth={a.cover.width} priority sizes="(min-width: 1024px) 896px, 100vw" className="mt-6 aspect-video w-full max-w-4xl rounded-card object-cover" />}
      {toc.length >= 3 && <nav aria-label="Contents" className="mt-6 max-w-2xl rounded-card border border-sand bg-white p-4 text-sm"><p className="font-medium text-forest">In this article</p><ul className="mt-2 space-y-1">{toc.map((h) => <li key={h.id} className={h.level === 3 ? "pl-4" : ""}><a className="underline-offset-2 hover:underline" href={`#${h.id}`}>{h.text}</a></li>)}</ul></nav>}
      <div className="mt-8 max-w-2xl"><Prose blocks={blocks} products={products} media={media} /></div>
      {a.tags.length > 0 && <ul aria-label="Tags" className="mt-8 flex max-w-2xl flex-wrap gap-2 text-sm">{a.tags.map((t) => <li key={t}><a className="rounded-full border border-sand bg-white px-3 py-1 hover:border-terracotta" href={`/journal?tag=${t}`}>#{t}</a></li>)}</ul>}
      {related.length > 0 && <section aria-labelledby="rel" className="mt-14"><h2 id="rel" className="mb-4 font-display text-2xl font-semibold text-forest">Keep reading</h2><Grid>{related.map((r) => <ArticleCard key={r.slug} a={r} />)}</Grid></section>}
    </>
  );
}
