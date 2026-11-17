import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { recentImports } from "@/modules/imports/service";
import { IMPORT_ENTITIES, IMPORT_ENTITY_LABELS } from "@/modules/imports/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import type { ImportLogRow } from "@/modules/imports/types";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import and export", robots: { index: false } };

const EXPORTS = [
  { name: "products", label: "Products and variants" },
  { name: "links", label: "Affiliate links" },
  { name: "deals", label: "Deals" },
  { name: "brands", label: "Brands" },
] as const;

const EXPORT_LINK_CLASS = "inline-block rounded-xl border border-forest-800 px-4 py-2.5 text-sm font-medium hover:bg-forest-100";

export default async function ImportExportPage() {
  await requirePagePermission(P.importRun);
  const history = await recentImports(15);
  const columns: Column<ImportLogRow>[] = [
    { key: "when", header: "When", cell: (r) => formatAdminDateTime(r.startedAt) },
    { key: "what", header: "What", cell: (r) => (r.entity ? (IMPORT_ENTITY_LABELS as Record<string, string>)[r.entity] ?? r.entity : "Import") },
    { key: "file", header: "File", cell: (r) => <span className="break-all text-xs">{r.source.replace(/^csv:[^:]*:?/, "") || r.source}</span> },
    { key: "rows", header: "Rows", cell: (r) => r.rowsProcessed },
    { key: "failed", header: "Problems", cell: (r) => (r.rowsFailed > 0 ? <span className="text-coral-600">{r.rowsFailed}</span> : 0) },
  ];

  return (
    <>
      <h1 className="text-3xl">Import and export</h1>
      <p className="mt-2 max-w-prose text-ink-600">Load many products, links, deals or brands from a spreadsheet, or download what you have. Importing the same file twice is safe: rows are matched by slug (products by slug and variants by SKU), so nothing is duplicated.</p>

      <section aria-labelledby="import-heading" className="mt-8">
        <h2 id="import-heading" className="text-xl">Import a CSV</h2>
        <div className="mt-4">
          <ImportWizard entities={IMPORT_ENTITIES.map((e) => ({ value: e, label: IMPORT_ENTITY_LABELS[e] }))} />
        </div>
        <p className="mt-4 max-w-prose text-sm text-ink-600">Conversion reports from your affiliate networks are imported on the <Link href="/admin/conversions/import" className="underline">conversions page</Link>.</p>
      </section>

      <section aria-labelledby="export-heading" className="mt-10">
        <h2 id="export-heading" className="text-xl">Export to CSV</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-600">Opens in Excel or Google Sheets. The columns match the import templates, so you can edit a file and import it back.</p>
        <ul className="mt-3 flex flex-wrap gap-3">
          {EXPORTS.map((e) => <li key={e.name}><Link href={`/admin/export/${e.name}`} prefetch={false} className={EXPORT_LINK_CLASS}>{e.label}</Link></li>)}
          <li><Link href="/admin/export/clicks?range=30" prefetch={false} className={EXPORT_LINK_CLASS}>Clicks, last 30 days</Link></li>
          <li><Link href="/admin/export/clicks?range=90" prefetch={false} className={EXPORT_LINK_CLASS}>Clicks, last 90 days</Link></li>
        </ul>
      </section>

      <section aria-labelledby="history-heading" className="mt-10">
        <h2 id="history-heading" className="text-xl">Recent imports</h2>
        <div className="mt-3">
          <DataTable caption="Recent imports" columns={columns} rows={history} getRowKey={(r) => r.id} empty={<EmptyState title="No imports yet" description="Imports you run appear here with how many rows were read and how many had problems." />} />
        </div>
      </section>
    </>
  );
}
