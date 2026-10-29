import { loadCategories } from "@/lib/data/catalog";
const I = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2";
type D = { id?: string; imageUrl?: string | null; name?: string; slug?: string; brand?: string; category?: string; blurb?: string; price?: number; mrp?: number | null; status?: string; featured?: boolean; seoTitle?: string | null; seoDescription?: string | null };
export async function ProductForm({ action, d = {}, error, withOffer = false }: { action: (f: FormData) => Promise<void>; d?: D; error?: string; withOffer?: boolean }) {
  const categories = await loadCategories();
  return (<form action={action} className="mt-6 grid max-w-xl gap-4 text-sm">
    {error && <p role="alert" className="text-terracotta-600">{error === "2" ? "Image must be JPG, PNG or WebP and under 3.5 MB." : error === "3" ? "Image upload failed. Check the Cloudinary settings." : error === "4" ? "That link is not on this merchant’s approved domains. Add the domain on the Merchants page first." : "Check the name, price (MRP must be higher than price), category and an https:// link."}</p>}
    {d.id && <input type="hidden" name="id" value={d.id} />}
    <label>Name<input name="name" required defaultValue={d.name} className={I} /></label>
    <label>URL slug (optional)<input name="slug" defaultValue={d.slug} className={I} /></label>
    <label>Brand slug (optional)<input name="brand" defaultValue={d.brand} className={I} /></label>
    <label>Category<select name="category" defaultValue={d.category} className={I}>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></label>
    <label>Short description<textarea name="blurb" rows={3} defaultValue={d.blurb} className={I} /></label>
    <div className="grid grid-cols-2 gap-4"><label>Price (₹)<input name="price" type="number" min="1" required defaultValue={d.price} className={I} /></label><label>MRP (₹, optional)<input name="mrp" type="number" min="1" defaultValue={d.mrp ?? ""} className={I} /></label></div>
    {withOffer && <><label>Merchant name<input name="merchant" required className={I} /></label>
    <label>Affiliate link (https)<input name="url" type="url" required className={I} /></label>
    <p className="text-xs text-ink/60">More retailers can be added after the product is saved.</p></>}
    <label>Product image (JPG, PNG or WebP, max 3.5 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" className={I} /></label>
    {d.imageUrl && <><input type="hidden" name="image_url" value={d.imageUrl} /><p className="text-xs text-ink/60">Current image is kept unless you choose a new one.</p></>}
    <label>Status<select name="status" defaultValue={d.status === "archived" ? "draft" : d.status ?? "published"} className={I}><option value="published">Published</option><option value="draft">Draft</option>{d.status === "archived" && <option value="archived" disabled>Archived (restore from the list)</option>}</select></label>
    <label className="flex items-center gap-2"><input type="checkbox" name="featured" defaultChecked={d.featured} />Featured</label>
    <label>SEO title (optional, up to 70 characters)<input name="seo_title" maxLength={70} defaultValue={d.seoTitle ?? ""} className={I} /></label>
    <label>SEO description (optional, up to 170 characters)<textarea name="seo_description" maxLength={170} rows={2} defaultValue={d.seoDescription ?? ""} className={I} /></label>
    <button className="rounded-full bg-forest py-2.5 font-medium text-ivory">Save product</button></form>);
}
