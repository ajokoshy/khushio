import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/ProductCard";
import { ProductView } from "@/components/ProductView";
import { categoryChain, loadBrands, loadCategories, loadProduct, loadProductSlugs } from "@/lib/data/catalog";
import { ArticleCard } from "@/components/ArticleCard";
import { Grid } from "@/components/ProductCard";
import { loadArticlesForProduct } from "@/lib/data/journal";
import { followRedirect } from "@/lib/redirects-db";
import { JsonLd } from "@/lib/seo/jsonld";
import { productJsonLd } from "@/lib/seo/product";
type P = { params: Promise<{ slug: string }> };
// Edits refresh the page immediately (cache tags); this only covers offers that expire by date.
export const revalidate = 21600;
export const generateStaticParams = async () => (await loadProductSlugs()).map((p) => ({ slug: p.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await loadProduct((await params).slug);
  return p ? { title: p.seoTitle || p.name, description: p.seoDescription || p.blurb, alternates: { canonical: `/products/${p.slug}` } } : {};
}
export default async function ProductPage({ params }: P) {
  const { slug } = await params; const p = await loadProduct(slug);
  if (!p) { await followRedirect(`/products/${slug}`); notFound(); }
  const brand = (await loadBrands()).find((b) => b.slug === p.brand);
  const crumbs = categoryChain(await loadCategories(), p.category).map((c) => ({ name: c.label, href: `/categories/${c.slug}` }));
  const mentions = await loadArticlesForProduct(p.slug);
  return (<Page><JsonLd data={productJsonLd(p, brand?.name)} /><ProductView p={p} brand={brand} crumbs={crumbs} />
    {mentions.length > 0 && <section aria-labelledby="mentions" className="mt-14"><h2 id="mentions" className="mb-4 font-display text-2xl font-semibold text-forest">From the journal</h2><Grid>{mentions.map((a) => <ArticleCard key={a.slug} a={a} />)}</Grid></section>}</Page>);
}
