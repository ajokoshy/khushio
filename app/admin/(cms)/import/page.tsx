import { importProducts } from "../../actions";
export default async function Import({ searchParams }: { searchParams: Promise<{ ok?: string; skipped?: string; e?: string }> }) {
  const sp = await searchParams;
  return (<div className="max-w-xl"><h1 className="font-display text-3xl font-semibold text-forest">Import products (CSV)</h1>
    <p className="mt-3 text-sm text-ink/75">Use the same columns as the products export: slug, name, brand, category, blurb, price, mrp, status, merchant, url. Rows with an existing slug are updated. Up to 100 rows per import; links must be https.</p>
    {sp.ok && <p role="status" className="mt-3 text-sm text-forest">Imported {sp.ok} rows, skipped {sp.skipped}.</p>}
    {sp.e && <p role="alert" className="mt-3 text-sm text-terracotta-600">Choose a CSV file under 500 KB.</p>}
    <form action={importProducts} className="mt-5 grid gap-4 text-sm"><input type="file" name="file" accept=".csv,text/csv" required /><button className="rounded-full bg-forest py-2.5 font-medium text-ivory">Import</button></form>
    <p className="mt-4 text-sm"><a className="underline" href="/admin/export/products">Download the current products CSV</a> to use as a template.</p></div>);
}
