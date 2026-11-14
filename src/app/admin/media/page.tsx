import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { imageUrl } from "@/infrastructure/cloudinary";
import { listMedia } from "@/modules/media/service";
import type { MediaListRow, MediaUsageFilter } from "@/modules/media/types";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Pagination } from "@/shared/admin/pagination";
import { AltEditor } from "./alt-editor";
import { deleteMediaAction } from "./actions";

export const metadata = { title: "Media library", robots: { index: false } };

const kilobytes = (bytes: number | null) => (bytes === null ? "" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const columns: Column<MediaListRow>[] = [
  {
    key: "preview",
    header: "Image",
    cell: (m) => {
      const url = imageUrl(m.publicId, "thumbnail");
      // Cloudinary already serves a small, optimised file; next/image would add nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      return url ? <img src={url} alt={m.alt ?? ""} width={64} height={64} loading="lazy" className="h-16 w-16 rounded-lg object-cover" /> : <span className="text-xs text-ink-600">No preview</span>;
    },
  },
  { key: "file", header: "File", cell: (m) => <><code className="break-all text-xs">{m.publicId.replace("khushio/products/", "")}</code><div className="text-xs text-ink-600">{m.width && m.height ? `${m.width}×${m.height}` : ""} {kilobytes(m.bytes)}</div></> },
  { key: "alt", header: "Default description", cell: (m) => <AltEditor id={m.id} initial={m.alt ?? ""} /> },
  { key: "used", header: "Used by", cell: (m) => (m.usedBy === 0 ? <span className="rounded-full bg-coral-100 px-2 py-0.5 text-xs text-coral-600">Unused</span> : `${m.usedBy} product image${m.usedBy === 1 ? "" : "s"}`) },
  {
    key: "actions",
    header: "Actions",
    cell: (m) =>
      m.usedBy === 0 ? (
        <ConfirmActionButton label="Delete" destructive title="Delete this image?" description="It is removed from Cloudinary and the library. This cannot be undone." action={deleteMediaAction.bind(null, m.id)} />
      ) : (
        <span className="text-xs text-ink-600">In use</span>
      ),
  },
];

export default async function MediaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.mediaWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 20 });
  const usage: MediaUsageFilter = firstParam(sp.usage) === "unused" ? "unused" : "all";
  const { rows, hasNext } = await listMedia({ q, usage, limit: pageSize, offset });

  return (
    <>
      <h1 className="text-3xl">Media library</h1>
      <p className="mt-2 max-w-prose text-ink-600">Every image stored in Cloudinary. Images are uploaded from a product&apos;s edit screen; the same picture is stored once. Use the unused filter to find files you can delete.</p>

      <div className="mt-6">
        <ListToolbar action="/admin/media" q={q} placeholder="Search file name">
          <div>
            <label htmlFor="usage" className="sr-only">Show</label>
            <select id="usage" name="usage" defaultValue={usage} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              <option value="all">All images</option>
              <option value="unused">Unused images</option>
            </select>
          </div>
        </ListToolbar>
        <DataTable
          caption="Media library"
          columns={columns}
          rows={rows}
          getRowKey={(m) => m.id}
          empty={
            q || usage === "unused" ? (
              <EmptyState title="No images match" description="Try a different search, or reset the filters." />
            ) : (
              <EmptyState title="No images yet" action={<Link href="/admin/products" className="font-medium text-coral-600 underline">Open a product to upload one</Link>} />
            )
          }
        />
        <Pagination basePath="/admin/media" params={{ q, usage: usage === "all" ? undefined : usage }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
