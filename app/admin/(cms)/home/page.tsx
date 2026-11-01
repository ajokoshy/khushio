import { Alert, Badge, Button, ButtonLink, Card, PageTitle, Select, SectionTitle } from "@/components/ui";
import { loadHomeSections, type HomeSection } from "@/lib/home/data";
import { SECTION_ORDER, SECTION_TYPES, visibility, type Visibility } from "@/lib/home/sections";
import { db, schema } from "@/lib/db";
import { asc } from "drizzle-orm";
import { addHomeSection, createDefaultHome, deleteHomeSection, moveHomeSection, resetHome } from "../../actions";
export const dynamic = "force-dynamic";
const TONE = { live: "success", hidden: "info", scheduled: "warn", expired: "error" } as const, LABEL: Record<Visibility, string> = { live: "Live", hidden: "Hidden", scheduled: "Scheduled", expired: "Ended" };
export default async function Home({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const rows = db ? await db.select().from(schema.homeSections).orderBy(asc(schema.homeSections.position), asc(schema.homeSections.id)) : [];
  const builtIn = !rows.length, list: HomeSection[] = builtIn ? await loadHomeSections() : rows.map((r) => ({ id: r.id, type: r.type as HomeSection["type"], position: r.position, enabled: r.enabled, publishAt: r.publishAt?.toISOString() ?? null, unpublishAt: r.unpublishAt?.toISOString() ?? null, config: (r.config ?? {}) as HomeSection["config"], stored: true }));
  return (<div className="max-w-3xl"><PageTitle actions={<ButtonLink href="/" variant="secondary" small>View site</ButtonLink>}>Homepage sections</PageTitle>
    {(await searchParams).e === "limit" && <Alert tone="error">The homepage can have up to 30 sections.</Alert>}
    {builtIn ? <Alert tone="info">The homepage is using the built-in layout shown below, which costs no storage. Customise it to reorder, schedule, add or remove sections.</Alert> : <p className="text-sm text-ink/70">Sections appear top to bottom. Scheduled sections switch on or off when the page next refreshes (within about 30 minutes).</p>}
    <ul className="mt-4 space-y-3">{list.map((s, i) => { const v = visibility(s); const t = SECTION_TYPES[s.type];
      return (<li key={s.id}><Card className="!p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-forest">{i + 1}. {t.label} <Badge tone={TONE[v]}>{LABEL[v]}</Badge></p><p className="text-xs text-ink/60">{t.description}</p></div>
        {s.stored && <div className="flex flex-wrap gap-2"><ButtonLink href={`/admin/home/${s.id}`} variant="secondary" small>Edit</ButtonLink>
          <form action={moveHomeSection}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><Button variant="secondary" small disabled={i === 0} aria-label="Move up">↑</Button></form>
          <form action={moveHomeSection}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><Button variant="secondary" small disabled={i === list.length - 1} aria-label="Move down">↓</Button></form>
          <form action={deleteHomeSection}><input type="hidden" name="id" value={s.id} /><Button variant="danger" small>Remove</Button></form></div>}</div></Card></li>); })}</ul>
    {builtIn ? <form action={createDefaultHome} className="mt-4"><Button>Customise the homepage</Button></form> : (<>
      <SectionTitle>Add a section</SectionTitle><Card><form action={addHomeSection} className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Section type<Select name="type">{SECTION_ORDER.map((k) => <option key={k} value={k}>{SECTION_TYPES[k].label}</option>)}</Select></label><Button>Add</Button></form></Card>
      <form action={resetHome} className="mt-6"><Button variant="link">Reset to the built-in layout</Button></form></>)}</div>);
}
