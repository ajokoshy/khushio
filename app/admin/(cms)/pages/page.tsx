import { Alert, Badge, Button, ButtonLink, Card, Field, Input, PageTitle, SectionTitle } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { DEFAULT_PAGES } from "@/lib/pages-core";
import { resetPage } from "../../actions";
export const dynamic = "force-dynamic";
const ERR: Record<string, string> = { slug: "Choose an address using letters and numbers. Names the site already uses (shop, deals, journal…) are not allowed.", title: "Give the page a title.", body: "A new page needs some text." };
export default async function Pages({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string; reset?: string }> }) {
  const sp = await searchParams, rows = db ? await db.select({ slug: schema.pages.slug, title: schema.pages.title, status: schema.pages.status }).from(schema.pages) : [];
  const by = new Map(rows.map((r) => [r.slug, r])); const customOnly = rows.filter((r) => !(r.slug in DEFAULT_PAGES));
  return (<div className="max-w-3xl"><PageTitle>Pages</PageTitle>
    <p className="mb-4 text-sm text-ink/70">Legal and information pages. Built-in pages use their default text until you edit them; resetting a page brings the default text back. Review the legal texts with a professional before launch.</p>
    {sp.e && <Alert tone="error">{ERR[sp.e] ?? "Could not save."}</Alert>}{sp.saved && <Alert tone="success">Saved “{sp.saved}”.</Alert>}{sp.reset && <Alert tone="success">Page reset to its default text.</Alert>}
    <ul className="mt-4 divide-y divide-sand rounded-card border border-sand bg-white">{[...Object.entries(DEFAULT_PAGES).map(([slug, d]) => ({ slug, title: by.get(slug)?.title ?? d.title, custom: by.has(slug), status: by.get(slug)?.status })), ...customOnly.map((r) => ({ slug: r.slug, title: r.title, custom: true, status: r.status }))].map((p) => (
      <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span><b>{p.title}</b> <code className="text-ink/60">/{p.slug}</code> {p.custom ? <Badge tone={p.status === "draft" ? "warn" : "success"}>{p.status === "draft" ? "Draft" : "Customised"}</Badge> : <Badge>Default text</Badge>}</span>
        <span className="flex items-center gap-2"><ButtonLink href={`/admin/pages/edit?slug=${p.slug}`} variant="secondary" small>Edit</ButtonLink>{p.custom && <form action={resetPage}><input type="hidden" name="slug" value={p.slug} /><Button variant="danger" small>{p.slug in DEFAULT_PAGES ? "Reset" : "Delete"}</Button></form>}</span></li>))}</ul>
    <SectionTitle>Add a page</SectionTitle><Card><form method="get" action="/admin/pages/edit" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><Field label="Address" hint="For example “returns” becomes /returns"><Input name="slug" required maxLength={60} /></Field><Button>Start page</Button></form></Card></div>);
}
