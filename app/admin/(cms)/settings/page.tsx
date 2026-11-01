import { Alert, Button, Field, Input, PageTitle, SectionTitle, Textarea } from "@/components/ui";
import { SETTINGS } from "@/lib/settings-schema";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "../../actions";
export const dynamic = "force-dynamic";
export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; e?: string; why?: string }> }) {
  const sp = await searchParams, s = await getSettings(), groups = [...new Set(SETTINGS.map((x) => x.group))];
  const bad = SETTINGS.find((x) => x.key === sp.e);
  return (<div className="max-w-2xl"><PageTitle>Site settings</PageTitle>
    <p className="mb-4 text-sm text-ink/70">Only values you change are saved; clearing a field returns it to its built-in default. Secrets (database, login, Cloudinary keys) are never edited here: they live in your hosting environment (see Status).</p>
    {sp.saved && <Alert tone="success">Saved. Changes appear on the site as soon as pages refresh (usually within minutes).</Alert>}
    {bad && <Alert tone="error">“{bad.label}” {sp.why ?? "is not valid"}.</Alert>}
    <form action={saveSettings} className="mt-4 grid gap-4">
      {groups.map((g) => (<fieldset key={g} className="grid gap-4 rounded-card border border-sand bg-white p-5"><legend className="px-2 font-display text-lg font-semibold text-forest">{g}</legend>
        {SETTINGS.filter((x) => x.group === g).map((d) => (<Field key={d.key} label={d.label} hint={"help" in d ? d.help : undefined}>
          {d.type === "textarea" ? <Textarea name={d.key} rows={3} maxLength={d.max} defaultValue={s[d.key]} /> : <Input name={d.key} maxLength={d.max} type={d.type === "email" ? "email" : "text"} defaultValue={s[d.key]} />}</Field>))}</fieldset>))}
      <div><Button>Save settings</Button></div></form><SectionTitle>Where each setting lives</SectionTitle>
    <p className="text-sm text-ink/70">Content and wording: here. Secrets and connections: environment variables (<code>DATABASE_URL</code>, <code>AUTH_SECRET</code>, <code>ADMIN_*</code>, <code>CLOUDINARY_*</code>). Feature switches: <code>lib/config/site.ts</code>.</p></div>);
}
