import { notFound } from "next/navigation";
import { ProductView } from "@/components/ProductView";
import { categoryChain, loadBrands, loadCategories, loadProductForPreview } from "@/lib/data/catalog";
export const dynamic = "force-dynamic";
/** Shows a product exactly as visitors would see it, including drafts and archived products (admin only). */
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const p = await loadProductForPreview((await params).id); if (!p) notFound();
  const brand = (await loadBrands()).find((b) => b.slug === p.brand);
  const crumbs = categoryChain(await loadCategories(), p.category).map((c) => ({ name: c.label, href: `/categories/${c.slug}` }));
  return (<div><p role="status" className="mb-6 rounded-lg bg-[#F6E6BD] p-3 text-sm text-[#7A5F10]">Preview. Status: <b>{p.status}</b>{p.status !== "published" ? ": visitors cannot see this page yet." : "."} <a className="underline" href={`/admin`}>Back to products</a></p>
    <ProductView p={p} brand={brand} crumbs={crumbs} preview /></div>);
}
