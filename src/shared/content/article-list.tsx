import Link from "next/link";
import { ProductImage } from "@/shared/catalog/product-image";
import type { PublicArticleSummary } from "@/modules/content/types";

export const formatArticleDate = (date: Date | null): string | null => (date ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null);

function Card({ a, priority }: { a: PublicArticleSummary; priority: boolean }) {
  const date = formatArticleDate(a.publishAt);
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-cream-200 bg-cream-50">
      <Link href={`/articles/${a.slug}`} className="block" tabIndex={-1} aria-hidden="true">
        <ProductImage publicId={a.coverPublicId} alt="" profiles={["card", "product"]} fallback="card" sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw" width={480} height={320} priority={priority} className="aspect-[3/2] w-full object-cover" />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        {a.categoryName && <p className="text-xs font-medium uppercase tracking-wide text-forest-800">{a.categoryName}</p>}
        <h2 className="mt-1 text-xl"><Link href={`/articles/${a.slug}`} className="hover:underline">{a.title}</Link></h2>
        {a.excerpt && <p className="mt-2 text-ink-600">{a.excerpt}</p>}
        <p className="mt-auto pt-3 text-xs text-ink-600">{[a.authorName, date].filter(Boolean).join(" · ")}</p>
      </div>
    </article>
  );
}

export function ArticleGrid({ articles }: { articles: PublicArticleSummary[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((a, i) => <li key={a.slug} className="flex"><div className="flex w-full"><Card a={a} priority={i === 0} /></div></li>)}
    </ul>
  );
}

/** Previous and next links for a listing. Page 1 has no ?page= so there is one address per list. */
export function ListPager({ basePath, page, hasNext }: { basePath: string; page: number; hasNext: boolean }) {
  if (page <= 1 && !hasNext) return null;
  const href = (p: number) => (p <= 1 ? basePath : `${basePath}?page=${p}`);
  return (
    <nav aria-label="More articles" className="mt-8 flex items-center justify-between text-sm">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="font-medium text-coral-600 underline">← Newer</Link> : <span />}
      {hasNext && <Link href={href(page + 1)} rel="next" className="font-medium text-coral-600 underline">Older →</Link>}
    </nav>
  );
}

export function EmptyArticles() {
  return <p className="rounded-card border border-cream-200 bg-cream-50 p-6 text-ink-600">No articles here yet. Check back soon.</p>;
}

export function pageFrom(value: string | string[] | undefined): number {
  const n = Number.parseInt(Array.isArray(value) ? value[0] ?? "" : value ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 200) : 1;
}
