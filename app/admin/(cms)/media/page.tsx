import { Img } from "@/components/Img";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageTitle } from "@/components/ui";
import { mediaMaxItems } from "@/lib/config/env";
import { getProvider } from "@/lib/media/provider";
import { listMedia, mediaStats } from "@/lib/data/media";
import { WIDTHS } from "@/lib/media/delivery";
import { deleteMedia, saveMediaAlt, uploadMedia } from "../../actions";
export const dynamic = "force-dynamic";
type SP = { page?: string; q?: string; f?: string; e?: string; saved?: string; dup?: string; deleted?: string };
const ERR: Record<string, string> = { file: "Choose an image file.", type: "Only JPG, PNG or WebP images are accepted.", size: "That file is over 3 MB. Resize or compress it first: smaller originals cost less to store.", alt: "Describe the image in a few words (alt text helps visitors using screen readers and search engines).", config: "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).", limit: "The library has reached its size limit (raise MEDIA_MAX_ITEMS, or delete unused images first).", upload: "Cloudinary rejected the upload. Try again.", used: "That image is still used somewhere. Remove it from there first.", remote: "Cloudinary could not delete it just now. Nothing was changed; try again." };
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
export default async function Media({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams, page = Math.max(1, Math.floor(Number(sp.page)) || 1), unused = sp.f === "unused", q = (sp.q ?? "").slice(0, 60);
  const [list, stats] = await Promise.all([listMedia({ page, q, unused }), mediaStats()]);
  const link = (p: number) => `/admin/media?${new URLSearchParams({ ...(q && { q }), ...(unused && { f: "unused" }), page: String(p) })}`, back = link(list.page);
  return (<div><PageTitle>Media library</PageTitle>
    {sp.e && <Alert tone="error">{ERR[sp.e] ?? "Something went wrong."}</Alert>}{sp.saved && <Alert tone="success">Saved.</Alert>}{sp.deleted && <Alert tone="success">Deleted from the library and from Cloudinary.</Alert>}
    {sp.dup && <Alert tone="info">That exact picture is already in the library, so nothing was uploaded again (this saves storage).</Alert>}
    {!getProvider().configured() && <Alert tone="warn">Image uploads are switched off (Cloudinary is not configured, or MEDIA_PROVIDER is set to external).</Alert>}
    <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card><form action={uploadMedia} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Field label="Image (JPG, PNG, WebP, up to 3 MB)"><input name="file" type="file" required accept="image/jpeg,image/png,image/webp" className="mt-1 w-full text-sm" /></Field>
        <Field label="Alt text (required)"><Input name="alt" required maxLength={125} /></Field><Button>Upload</Button></form></Card>
      <Card><p className="text-sm"><b>{stats.count}</b> images · <b>{mb(stats.bytes)}</b> stored · <b>{stats.unused}</b> unused</p><p className="mt-2 text-xs text-ink/70">Cost controls: duplicates are never re-uploaded; originals are capped at 1600 px; pictures are delivered in only {WIDTHS.length} sizes ({WIDTHS.join(", ")} px), so each image can create at most {WIDTHS.length} derived files. Limit: {mediaMaxItems()} images.</p></Card></div>
    <form role="search" className="my-5 flex flex-wrap items-center gap-3 text-sm"><Input name="q" defaultValue={q} placeholder="Search alt text" aria-label="Search media" className="!mt-0 max-w-xs" />
      <label className="flex items-center gap-2"><input type="checkbox" name="f" value="unused" defaultChecked={unused} />Unused only</label><Button variant="secondary" small>Filter</Button></form>
    {list.items.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.items.map((m) => (<li key={m.id}><Card className="!p-3">
      <Img src={m.publicId} alt={m.alt} width={320} height={240} originalWidth={m.width} sizes="(min-width: 1024px) 25vw, 50vw" className="aspect-[4/3] w-full rounded object-cover" />
      <p className="mt-2 text-xs text-ink/60">{m.width}×{m.height} · {m.bytes ? mb(m.bytes) : "?"} · {m.format} · {m.used ? <Badge tone="success">Used {m.used}×</Badge> : <Badge tone="warn">Unused</Badge>}</p>
      <form action={saveMediaAlt} className="mt-2 grid gap-2"><input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={back} /><Input name="alt" defaultValue={m.alt} maxLength={125} aria-label={`Alt text for ${m.publicId}`} className="!mt-0" /><Button variant="secondary" small>Save alt text</Button></form>
      <form action={deleteMedia} className="mt-2"><input type="hidden" name="id" value={m.id} /><Button variant="danger" small disabled={m.used > 0} title={m.used ? "Still in use" : "Delete from Cloudinary"}>Delete</Button></form>
      <details className="mt-2 text-xs"><summary className="cursor-pointer underline">Use in Markdown</summary><code className="mt-1 block break-all">![{m.alt}](media:{m.id})</code></details></Card></li>))}</ul> : <EmptyState>{unused ? "No unused images." : "No images yet. Upload your first one above."}</EmptyState>}
    {list.pages > 1 && <nav aria-label="Pages" className="mt-6 flex items-center gap-4 text-sm">{list.page > 1 && <a className="underline" href={link(list.page - 1)}>Previous</a>}<span>Page {list.page} of {list.pages}</span>{list.page < list.pages && <a className="underline" href={link(list.page + 1)}>Next</a>}</nav>}</div>);
}
