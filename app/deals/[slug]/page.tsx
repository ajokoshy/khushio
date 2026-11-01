import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Prose } from "@/components/Prose";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { AFFILIATE_REL } from "@/lib/affiliate/rules";
import { loadDealBySlug, loadDeals, searchProducts } from "@/lib/data/catalog";
import { parseMarkdown } from "@/lib/markdown";
import { followRedirect } from "@/lib/redirects-db";
import { slugify } from "@/lib/slug";
type P = { params: Promise<{ slug: string }> };
export const revalidate = 1800; // a deal ends by date, so this page re-checks every 30 minutes
export const generateStaticParams = async () => (await loadDeals()).map((d) => ({ slug: d.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const d = await loadDealBySlug((await params).slug); if (!d) return {};
  return { title: d.ended ? `${d.title} (ended)` : d.title, description: d.description?.slice(0, 160) || `${d.title} at ${d.merchant}.`, alternates: { canonical: `/deals/${d.slug}` }, robots: d.ended ? { index: false, follow: true } : undefined };
}
export default async function DealPage({ params }: P) {
  const { slug } = await params, d = await loadDealBySlug(slug);
  if (!d) { await followRedirect(`/deals/${slug}`); notFound(); }
  const [more, products] = await Promise.all([loadDeals().then((all) => all.filter((x) => x.merchant === d.merchant && x.slug !== d.slug).slice(0, 3)), searchProducts({ merchant: slugify(d.merchant), pageSize: 4 })]);
  return (<Page><Breadcrumbs items={[{ name: "Deals", href: "/deals" }, { name: d.title, href: `/deals/${d.slug}` }]} /><PageHead title={d.title} intro={`${d.merchant}${d.ends && !d.ended ? ` · ends ${d.ends}` : ""}`} />
    <div className="max-w-2xl">
      {d.ended ? <p role="status" className="rounded-lg bg-sand p-4 text-sm">This deal has ended. <a className="underline" href="/deals">See current deals</a>.</p> : <>
        {d.description && <Prose blocks={parseMarkdown(d.description)} />}
        <a href={`/go/${d.offerId}`} rel={AFFILIATE_REL} target="_blank" className="mt-6 inline-block rounded-full bg-terracotta px-6 py-3 text-sm font-medium text-white hover:bg-terracotta-600">Get this deal at {d.merchant}</a>
        <p className="mt-3 text-xs text-ink/60">Affiliate link: we may earn a commission at no extra cost to you. Terms and prices are set by the retailer.</p></>}</div>
    {more.length > 0 && <section aria-labelledby="more" className="mt-12"><h2 id="more" className="mb-3 font-display text-2xl font-semibold text-forest">More from {d.merchant}</h2><ul className="space-y-2 text-sm">{more.map((x) => <li key={x.slug}><a className="underline" href={`/deals/${x.slug}`}>{x.title}</a></li>)}</ul></section>}
    {products.items.length > 0 && <section aria-labelledby="prods" className="mt-12"><h2 id="prods" className="mb-4 font-display text-2xl font-semibold text-forest">Products at {d.merchant}</h2><Grid>{products.items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid></section>}</Page>);
}
