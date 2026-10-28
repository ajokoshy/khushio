import { categories } from "@/lib/config/site";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
type D = { id?: string; name?: string; slug?: string; brand?: string; category?: string; blurb?: string; price?: number; mrp?: number | null; status?: string; merchant?: string; url?: string };
export function ProductForm({ action, d = {}, error }: { action: (f: FormData) => Promise<void>; d?: D; error?: boolean }) {
  return (<form action={action} className="mt-6 grid max-w-xl gap-4 text-sm">
    {error && <p role="alert" className="text-terracotta-600">Check the name, price, category and an https:// link.</p>}
    {d.id && <input type="hidden" name="id" value={d.id} />}
    <label>Name<input name="name" required defaultValue={d.name} className={I} /></label>
    <label>URL slug (optional)<input name="slug" defaultValue={d.slug} className={I} /></label>
    <label>Brand slug (optional)<input name="brand" defaultValue={d.brand} className={I} /></label>
    <label>Category<select name="category" defaultValue={d.category} className={I}>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></label>
    <label>Short description<textarea name="blurb" rows={3} defaultValue={d.blurb} className={I} /></label>
    <div className="grid grid-cols-2 gap-4"><label>Price (₹)<input name="price" type="number" min="1" required defaultValue={d.price} className={I} /></label><label>MRP (₹, optional)<input name="mrp" type="number" min="1" defaultValue={d.mrp ?? ""} className={I} /></label></div>
    <label>Merchant name<input name="merchant" defaultValue={d.merchant} className={I} /></label>
    <label>Affiliate link (https)<input name="url" type="url" required defaultValue={d.url} className={I} /></label>
    <label>Status<select name="status" defaultValue={d.status ?? "published"} className={I}><option value="published">Published</option><option value="draft">Draft</option></select></label>
    <button className="rounded-full bg-forest py-2.5 font-medium text-ivory">Save product</button></form>);
}
