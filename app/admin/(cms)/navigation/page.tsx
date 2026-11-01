import { Alert, Badge, Button, Card, Check, EmptyState, Field, Input, PageTitle, SectionTitle } from "@/components/ui";
import { defaultMenu, loadMenuRows } from "@/lib/nav";
import { MENUS } from "@/lib/nav-core";
import { customiseNav, deleteNavItem, moveNavItem, resetNav, saveNavItem } from "../../actions";
export const dynamic = "force-dynamic";
const NAMES = { header: "Header menu", footer: "Footer links" } as const;
export default async function Navigation({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  const menus = await Promise.all(MENUS.map(async (m) => ({ m, rows: await loadMenuRows(m) })));
  return (<div className="max-w-3xl"><PageTitle>Navigation</PageTitle>
    <p className="mb-4 text-sm text-ink/70">Until you customise a menu, the site uses its built-in links. Customising stores one small row per link.</p>
    {e && <Alert tone="error">{e === "label" ? "Give the link a label of up to 40 characters." : "Links must be a site path like /deals or an https:// address."}</Alert>}
    {menus.map(({ m, rows }) => (<section key={m} aria-labelledby={`h-${m}`}><SectionTitle>{NAMES[m]}</SectionTitle><span id={`h-${m}`} className="sr-only">{NAMES[m]}</span>
      {!rows.length ? (<Card><p className="mb-3 text-sm">Using the built-in links: {defaultMenu(m).map((l) => l.label).join(", ") || "none"}.</p>
        <form action={customiseNav}><input type="hidden" name="menu" value={m} /><Button variant="secondary" small>Customise this menu</Button></form></Card>) : (<>
        <ul className="space-y-3">{rows.map((r, i) => (<li key={r.id}><Card className="!p-4"><form action={saveNavItem} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="id" value={r.id} /><input type="hidden" name="menu" value={m} />
          <Field label="Label"><Input name="label" defaultValue={r.label} maxLength={40} required /></Field><Field label="Link"><Input name="href" defaultValue={r.href} required /></Field>
          <div className="flex flex-wrap items-center gap-3"><Check name="enabled" label="Show" defaultChecked={r.enabled} /><Check name="new_tab" label="New tab" defaultChecked={r.newTab} /><Button small>Save</Button>{!r.enabled && <Badge tone="warn">Hidden</Badge>}</div></form>
          <div className="mt-3 flex gap-2">
            <form action={moveNavItem}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="dir" value="up" /><Button variant="secondary" small disabled={i === 0} aria-label={`Move ${r.label} up`}>↑ Up</Button></form>
            <form action={moveNavItem}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="dir" value="down" /><Button variant="secondary" small disabled={i === rows.length - 1} aria-label={`Move ${r.label} down`}>↓ Down</Button></form>
            <form action={deleteNavItem}><input type="hidden" name="id" value={r.id} /><Button variant="danger" small>Delete</Button></form></div></Card></li>))}</ul>
        <Card className="mt-4"><form action={saveNavItem} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><input type="hidden" name="menu" value={m} />
          <Field label="New link label"><Input name="label" maxLength={40} required /></Field><Field label="Link"><Input name="href" placeholder="/deals" required /></Field>
          <div className="flex items-center gap-3"><input type="hidden" name="enabled" value="on" /><Button small>Add link</Button></div></form></Card>
        <form action={resetNav} className="mt-3"><input type="hidden" name="menu" value={m} /><Button variant="link">Reset to built-in links</Button></form></>)}</section>))}
    {!menus.length && <EmptyState>No menus.</EmptyState>}</div>);
}
