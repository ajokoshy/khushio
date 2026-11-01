import { asc } from "drizzle-orm";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageTitle, SectionTitle, Select, Textarea } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { deleteComparison, saveComparison } from "../../actions";
export const dynamic = "force-dynamic";
const ERR: Record<string, string> = { title: "Give the comparison a title.", slug: "Choose an address using letters or numbers.", products: "Choose between 2 and 4 products (by address, comma separated)." };
export default async function Comparisons({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string }> }) {
  const sp = await searchParams, rows = db ? await db.select().from(schema.comparisons).orderBy(asc(schema.comparisons.title)) : [];
  const form = (c?: (typeof rows)[number]) => (<form action={saveComparison} className="grid gap-3">{c && <input type="hidden" name="id" value={c.id} />}
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Title"><Input name="title" required maxLength={100} defaultValue={c?.title} /></Field><Field label="Address" hint="Becomes /compare/address"><Input name="slug" maxLength={80} defaultValue={c?.slug} /></Field></div>
    <Field label="Products (2 to 4 addresses, comma separated)"><Input name="products" required defaultValue={c?.productSlugs.join(", ")} /></Field>
    <Field label="Intro (optional)"><Textarea name="intro" rows={2} maxLength={600} defaultValue={c?.intro} /></Field>
    <Field label="Our verdict (Markdown, optional)"><Textarea name="verdict" rows={5} maxLength={1500} defaultValue={c?.verdict} /></Field>
    <div className="flex flex-wrap items-end gap-4"><Field label="Status"><Select name="status" defaultValue={c?.status ?? "published"}><option value="published">Published</option><option value="draft">Draft</option></Select></Field><Button small>{c ? "Save" : "Add comparison"}</Button></div></form>);
  return (<div className="max-w-3xl"><PageTitle>Curated comparisons</PageTitle>
    {sp.e && <Alert tone="error">{ERR[sp.e] ?? "Could not save."}</Alert>}{sp.saved && <Alert tone="success">Saved.</Alert>}
    {rows.length ? <ul className="mt-4 space-y-3">{rows.map((c) => (<li key={c.id}><Card className="!p-4"><p className="mb-3 text-sm"><b>{c.title}</b> <code className="text-ink/60">/compare/{c.slug}</code> {c.status === "draft" && <Badge tone="warn">Draft</Badge>}</p>{form(c)}<form action={deleteComparison} className="mt-2"><input type="hidden" name="id" value={c.id} /><Button variant="danger" small>Delete</Button></form></Card></li>))}</ul> : <EmptyState>No comparisons yet.</EmptyState>}
    <SectionTitle>Add a comparison</SectionTitle><Card>{form()}</Card></div>);
}
