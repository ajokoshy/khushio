import type { Metadata } from "next";
import { CategoryStrip } from "@/components/CategoryStrip";
import { Pagination, SearchBar } from "@/components/Listing";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { loadCategories, searchProducts } from "@/lib/data/catalog";
import { listingSeo } from "@/lib/seo/listing";
import { normalizeSearch } from "@/lib/search-core";
type SP = Promise<Record<string, string | string[] | undefined>>;
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const s = listingSeo("/shop", await searchParams, { catIsFilter: true });
  return { title: s.q ? `Results for “${s.q}”` : s.page > 1 ? `Shop (page ${s.page})` : "Shop", description: "Browse all products on Khushio.", alternates: { canonical: s.canonical }, robots: s.noindex ? { index: false, follow: true } : undefined };
}
export default async function Shop({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams, f = normalizeSearch(sp as Parameters<typeof normalizeSearch>[0]);
  const [cats, r] = await Promise.all([loadCategories(), searchProducts(sp as Parameters<typeof normalizeSearch>[0])]);
  const params = { q: f.q, cat: f.categories?.[0], min: f.min, max: f.max, sort: sp.sort as string | undefined };
  return (<Page><PageHead title={f.q ? `Results for “${f.q}”` : "Shop"} intro={r.total ? `${r.total} product${r.total === 1 ? "" : "s"}` : undefined} />
    <SearchBar action="/shop" q={f.q} cat={f.categories?.[0]} sort={f.sort} min={f.min} max={f.max} categories={cats} />
    {r.items.length ? <><Grid>{r.items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid><Pagination path="/shop" params={params} page={r.page} pages={r.pages} /></>
      : <NoResults />}</Page>);
}
async function NoResults() {
  const featured = (await searchProducts({ sort: "featured", pageSize: 3 })).items;
  return (<div><p className="mb-6">No products match. Try fewer or broader words, or remove a price limit.</p>
    <h2 className="mb-4 font-display text-2xl font-semibold text-forest">Browse by category</h2><CategoryStrip />
    {featured.length > 0 && <><h2 className="mb-4 mt-12 font-display text-2xl font-semibold text-forest">You might like</h2><Grid>{featured.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid></>}</div>);
}
