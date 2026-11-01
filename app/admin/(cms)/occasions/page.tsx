import { asc } from "drizzle-orm";
import { Alert, Badge, Button, Card, Check, EmptyState, Field, Input, PageTitle, SectionTitle, Textarea } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { deleteOccasion, saveOccasion } from "../../actions";
export const dynamic = "force-dynamic";
const ERR: Record<string, string> = { title: "Give the occasion a title.", slug: "Choose an address using letters or numbers.", price: "Prices must be positive whole numbers, and the maximum cannot be below the minimum.", empty: "Add at least one category, a price limit or some search words, otherwise the page would list everything." };
export default async function Occasions({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string }> }) {
  const sp = await searchParams, rows = db ? await db.select().from(schema.giftOccasions).orderBy(asc(schema.giftOccasions.position), asc(schema.giftOccasions.title)) : [];
  const form = (o?: (typeof rows)[number]) => (<form action={saveOccasion} className="grid gap-3 sm:grid-cols-2">{o && <input type="hidden" name="id" value={o.id} />}
    <Field label="Title"><Input name="title" required maxLength={80} defaultValue={o?.title} /></Field><Field label="Address" hint="Becomes /gifts/address"><Input name="slug" maxLength={60} defaultValue={o?.slug} /></Field>
    <Field label="Categories (addresses, comma separated)"><Input name="categories" defaultValue={o?.categories} /></Field><Field label="Search words (optional)"><Input name="query" maxLength={60} defaultValue={o?.query} /></Field>
    <Field label="Minimum price (₹)"><Input name="min_price" type="number" min={1} defaultValue={o?.minPrice ?? ""} /></Field><Field label="Maximum price (₹)"><Input name="max_price" type="number" min={1} defaultValue={o?.maxPrice ?? ""} /></Field>
    <div className="sm:col-span-2"><Field label="Intro (optional)"><Textarea name="intro" rows={2} maxLength={400} defaultValue={o?.intro} /></Field></div>
    <Field label="Order"><Input name="position" type="number" defaultValue={o?.position ?? 0} /></Field><div className="flex items-end gap-4"><Check name="enabled" label="Show" defaultChecked={o ? o.enabled : true} /><Button small>{o ? "Save" : "Add occasion"}</Button></div></form>);
  return (<div className="max-w-3xl"><PageTitle>Gift occasions</PageTitle><p className="mb-4 text-sm text-ink/70">An occasion is a saved search (categories, price range, words). Nothing is stored per product, so it stays up to date by itself.</p>
    {sp.e && <Alert tone="error">{ERR[sp.e] ?? "Could not save."}</Alert>}{sp.saved && <Alert tone="success">Saved.</Alert>}
    {rows.length ? <ul className="mt-4 space-y-3">{rows.map((o) => (<li key={o.id}><Card className="!p-4"><p className="mb-3 text-sm"><b>{o.title}</b> <code className="text-ink/60">/gifts/{o.slug}</code> {!o.enabled && <Badge tone="warn">Hidden</Badge>}</p>{form(o)}<form action={deleteOccasion} className="mt-2"><input type="hidden" name="id" value={o.id} /><Button variant="danger" small>Delete</Button></form></Card></li>))}</ul> : <EmptyState>No occasions yet.</EmptyState>}
    <SectionTitle>Add an occasion</SectionTitle><Card>{form()}</Card></div>);
}
