import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { Alert, Button, Check, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { SECTION_TYPES, isSectionType, resolveConfig, type FieldDef, type SectionDef } from "@/lib/home/sections";
import { toLocalInput } from "@/lib/journal-core";
import { saveHomeSection } from "../../../actions";
export const dynamic = "force-dynamic";
export default async function EditSection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; why?: string; saved?: string }> }) {
  const { id } = await params, sp = await searchParams; if (!db || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db.select().from(schema.homeSections).where(eq(schema.homeSections.id, id)); if (!row || !isSectionType(row.type)) notFound();
  const def = SECTION_TYPES[row.type] as SectionDef, c = resolveConfig(row.type, row.config), bad = def.fields.find((f) => f.key === sp.e);
  const input = (f: FieldDef) => {
    const v = c[f.key];
    switch (f.kind) {
      case "textarea": return <Textarea name={f.key} rows={4} maxLength={f.max} defaultValue={String(v ?? "")} />;
      case "int": return <Input name={f.key} type="number" min={f.min} max={f.max} defaultValue={Number(v)} />;
      case "select": return <Select name={f.key} defaultValue={String(v)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
      case "slugs": return <Textarea name={f.key} rows={3} defaultValue={(v as string[]).join(", ")} />;
      case "bool": return <Check name={f.key} label={f.label} defaultChecked={!!v} />;
      case "media": return null;
      default: return <Input name={f.key} maxLength={f.max} defaultValue={String(v ?? "")} />;
    }
  };
  return (<div className="max-w-2xl"><PageTitle>{def.label}</PageTitle><p className="mb-4 text-sm text-ink/70">{def.description}</p>
    {sp.saved && <Alert tone="success">Saved.</Alert>}{bad && <Alert tone="error">“{bad.label}” {sp.why ?? "is not valid"}.</Alert>}{sp.e === "dates" && <Alert tone="error">Check the dates: the end must be after the start.</Alert>}
    <form action={saveHomeSection} className="mt-4 grid gap-4"><input type="hidden" name="id" value={row.id} />
      {def.fields.map((f) => f.kind === "media" ? <MediaPicker key={f.key} name={f.key} value={typeof c[f.key] === "string" ? (c[f.key] as string) : null} label={f.label} />
        : f.kind === "bool" ? <div key={f.key}>{input(f)}</div> : <Field key={f.key} label={f.label} hint={f.help}>{input(f)}</Field>)}
      <fieldset className="grid gap-4 rounded-card border border-sand bg-white p-4"><legend className="px-2 text-sm font-medium">Visibility</legend>
        <Check name="enabled" label="Show this section" defaultChecked={row.enabled} />
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Start showing (India time, optional)"><Input name="publish_at" type="datetime-local" defaultValue={toLocalInput(row.publishAt)} /></Field><Field label="Stop showing (optional)"><Input name="unpublish_at" type="datetime-local" defaultValue={toLocalInput(row.unpublishAt)} /></Field></div></fieldset>
      <div className="flex gap-3"><Button>Save section</Button><a className="self-center text-sm underline" href="/admin/home">Back to sections</a></div></form></div>);
}
