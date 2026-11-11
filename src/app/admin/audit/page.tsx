import { listAuditLogs } from "@/core/audit";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Pagination } from "@/shared/admin/pagination";

export const metadata = { title: "Audit log", robots: { index: false } };

type Row = Awaited<ReturnType<typeof listAuditLogs>>["rows"][number];

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" });

function summarise(metadata: unknown): string {
  if (!metadata) return "";
  const text = JSON.stringify(metadata);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

const columns: Column<Row>[] = [
  { key: "when", header: "When (IST)", cell: (r) => <time dateTime={r.createdAt.toISOString()} className="whitespace-nowrap">{dateFormat.format(r.createdAt)}</time> },
  { key: "actor", header: "Actor", cell: (r) => r.actorEmail ?? <span className="text-ink-600">system</span> },
  { key: "action", header: "Action", cell: (r) => <code className="text-xs">{r.action}</code> },
  { key: "entity", header: "Entity", cell: (r) => <span>{r.entityType}{r.entityId ? <span className="block max-w-[14rem] truncate text-xs text-ink-600" title={r.entityId}>{r.entityId}</span> : null}</span> },
  { key: "meta", header: "Details", cell: (r) => <code className="text-xs text-ink-600">{summarise(r.metadata)}</code> },
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.auditView);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const includeAttempts = firstParam(sp.attempts) === "1";

  const { rows, hasNext } = await listAuditLogs({ q, includeAttempts, limit: pageSize, offset });

  return (
    <>
      <h1 className="text-3xl">Audit log</h1>
      <p className="mt-2 mb-6 text-ink-600">Who did what, newest first.</p>

      <ListToolbar action="/admin/audit" q={q} placeholder="Search action, entity or actor email">
        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" name="attempts" value="1" defaultChecked={includeAttempts} />
          Include failed-login counters
        </label>
      </ListToolbar>

      <DataTable
        caption="Audit log entries"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        empty={<EmptyState title="No entries match" description="Try a different search, or clear the filters." />}
      />
      <Pagination basePath="/admin/audit" params={{ q, attempts: includeAttempts }} page={page} hasNext={hasNext} />
    </>
  );
}
