import { getSettings } from "@/lib/settings";
import { saveSettings } from "../../actions";
export const dynamic = "force-dynamic";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const s = await getSettings();
  return (<div className="max-w-xl"><h1 className="font-display text-3xl font-semibold text-forest">Homepage and site settings</h1>
    {(await searchParams).saved && <p role="status" className="mt-3 text-sm text-forest">Saved. Changes show on the site within a minute.</p>}
    <form action={saveSettings} className="mt-6 grid gap-4 text-sm">
      <label>Homepage headline (one line per row)<textarea name="hero_title" rows={3} defaultValue={s.hero_title} className={I} /></label>
      <label>Homepage sub-text<textarea name="hero_subtitle" rows={3} defaultValue={s.hero_subtitle} className={I} /></label>
      <label>Search box hint<input name="search_placeholder" defaultValue={s.search_placeholder} className={I} /></label>
      <label>Announcement bar (leave empty to hide)<input name="announcement" defaultValue={s.announcement} className={I} /></label>
      <button className="rounded-full bg-forest py-2.5 font-medium text-ivory">Save settings</button></form></div>);
}
