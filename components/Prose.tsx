import type { ReactNode } from "react";
import { ProductCard } from "@/components/ProductCard";
import { Img } from "@/components/Img";
import { AFFILIATE_REL } from "@/lib/affiliate/rules";
import type { Product } from "@/lib/data/catalog";
import type { Block, Inline } from "@/lib/markdown";

export type ProseMedia = Record<string, { publicId: string; alt: string; width: number | null; height: number | null }>;
const REL_EXT = "nofollow noopener noreferrer";

function inline(c: Inline[]): ReactNode[] {
  return c.map((x, i) => {
    if (x.t === "text") return x.v;
    if (x.t === "code") return <code key={i} className="rounded bg-sand px-1 py-0.5 text-[0.9em]">{x.v}</code>;
    if (x.t === "b") return <strong key={i}>{inline(x.c)}</strong>;
    if (x.t === "i") return <em key={i}>{inline(x.c)}</em>;
    if (x.kind === "internal") return <a key={i} href={x.href} className="text-terracotta underline underline-offset-2">{inline(x.c)}</a>;
    return <a key={i} href={x.href} rel={x.kind === "go" ? AFFILIATE_REL : REL_EXT} target="_blank" className="text-terracotta underline underline-offset-2">{inline(x.c)}</a>;
  });
}

/** Renders parsed Markdown. Product cards and images are resolved by the caller (one batched lookup each). */
export function Prose({ blocks, products = {}, media = {} }: { blocks: Block[]; products?: Record<string, Product>; media?: ProseMedia }) {
  return (
    <div className="space-y-5 text-[1.05rem] leading-8 text-ink/90">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h": { const H = (`h${b.level}`) as "h2" | "h3" | "h4"; return <H key={i} id={b.id} className="scroll-mt-24 pt-4 font-display font-semibold text-forest" style={{ fontSize: b.level === 2 ? "1.75rem" : b.level === 3 ? "1.4rem" : "1.15rem" }}>{inline(b.c)}</H>; }
          case "p": return <p key={i}>{inline(b.c)}</p>;
          case "ul": return <ul key={i} className="list-disc space-y-1 pl-6">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
          case "ol": return <ol key={i} className="list-decimal space-y-1 pl-6">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>;
          case "quote": return <blockquote key={i} className="border-l-4 border-terracotta pl-4 italic text-ink/80">{inline(b.c)}</blockquote>;
          case "hr": return <hr key={i} className="border-sand" />;
          case "code": return <pre key={i} className="overflow-x-auto rounded-lg bg-sand p-4 text-sm"><code>{b.v}</code></pre>;
          case "product": { const p = products[b.slug]; return p ? <div key={i} className="not-prose max-w-xs"><ProductCard p={p} /></div> : null; }
          case "img": { const m = media[b.mediaId]; return m ? <figure key={i}><Img src={m.publicId} alt={b.alt || m.alt} width={960} height={m.width && m.height ? Math.round((960 * m.height) / m.width) : 540} originalWidth={m.width} sizes="(min-width: 768px) 672px, 100vw" className="h-auto w-full rounded-card" /></figure> : null; }
        }
      })}
    </div>
  );
}
