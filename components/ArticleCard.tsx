import { Img } from "@/components/Img";
import type { JournalCard } from "@/lib/data/journal";

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function ArticleCard({ a }: { a: JournalCard }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-sand bg-white">
      {a.cover && <a href={`/journal/${a.slug}`} tabIndex={-1} aria-hidden="true"><Img src={a.cover.publicId} alt="" width={640} height={360} originalWidth={a.cover.width} sizes="(min-width: 1024px) 33vw, 100vw" className="aspect-video w-full object-cover" /></a>}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs text-ink/60">{a.category && <a className="font-medium text-terracotta underline" href={`/journal/${a.category.slug}`}>{a.category.name}</a>}{a.category && " · "}{fmtDate(a.publishedAt)} · {a.readMinutes} min read</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-forest"><a href={`/journal/${a.slug}`}>{a.title}</a></h2>
        <p className="mt-2 text-sm text-ink/75">{a.excerpt}</p>
      </div>
    </article>
  );
}
