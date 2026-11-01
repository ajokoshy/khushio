import { Alert, Badge, Button, ButtonLink, EmptyState, Input, PageTitle, Select } from "@/components/ui";
import { listArticlesAdmin } from "@/lib/data/journal-admin";
import type { ArticleState } from "@/lib/journal-core";
export const dynamic = "force-dynamic";
const TONE = { draft: "info", scheduled: "warn", live: "success" } as const, LABEL = { draft: "Draft", scheduled: "Scheduled", live: "Live" } as const;
const day = (d: Date | null) => (d ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
export default async function Articles({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; page?: string; deleted?: string }> }) {
  const sp = await searchParams, state = (["draft", "scheduled", "live"] as const).find((x) => x === sp.s), q = (sp.q ?? "").slice(0, 80);
  const r = await listArticlesAdmin({ q, state, page: Math.floor(Number(sp.page)) || 1 });
  const link = (p: number) => `/admin/articles?${new URLSearchParams({ ...(q && { q }), ...(state && { s: state }), page: String(p) })}`;
  return (<div><PageTitle actions={<><ButtonLink href="/admin/articles/categories" variant="secondary" small>Categories</ButtonLink><ButtonLink href="/admin/articles/new" variant="accent" small>New article</ButtonLink></>}>Articles ({r.total})</PageTitle>
    {sp.deleted && <Alert tone="success">Article deleted.</Alert>}
    <form role="search" className="my-4 flex flex-wrap gap-2"><Input name="q" defaultValue={q} placeholder="Search titles" aria-label="Search articles" className="!mt-0 max-w-xs" />
      <Select name="s" defaultValue={state ?? ""} aria-label="State" className="!mt-0 max-w-[10rem]"><option value="">All</option><option value="live">Live</option><option value="scheduled">Scheduled</option><option value="draft">Draft</option></Select><Button variant="secondary" small>Filter</Button></form>
    {r.items.length ? <ul className="divide-y divide-sand rounded-card border border-sand bg-white">{r.items.map((a) => (<li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <span><a className="font-medium underline" href={`/admin/articles/${a.id}`}>{a.title}</a> <Badge tone={TONE[a.state as ArticleState]}>{LABEL[a.state as ArticleState]}</Badge><span className="block text-xs text-ink/60">/journal/{a.slug}{a.cat ? ` · ${a.cat}` : ""}{a.state === "scheduled" ? ` · goes live ${day(a.publishAt)}` : ""}</span></span>
      <span className="flex gap-2"><ButtonLink href={`/admin/preview/article/${a.id}`} variant="secondary" small>Preview</ButtonLink><ButtonLink href={`/admin/articles/${a.id}`} variant="secondary" small>Edit</ButtonLink></span></li>))}</ul> : <EmptyState>No articles match.</EmptyState>}
    {r.pages > 1 && <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">{r.page > 1 && <a className="underline" href={link(r.page - 1)}>Previous</a>}<span>Page {r.page} of {r.pages}</span>{r.page < r.pages && <a className="underline" href={link(r.page + 1)}>Next</a>}</nav>}</div>);
}
