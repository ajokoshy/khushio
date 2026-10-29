import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/ProductCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cld } from "@/lib/cloudinary";
import { slugify } from "@/lib/slug";
import { AFFILIATE_REL } from "@/lib/affiliate/rules";
import { JsonLd } from "@/lib/seo/jsonld";
import { site } from "@/lib/config/site";
import { loadBrands, catLabel, inr, loadProducts } from "@/lib/data/catalog";
type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = async () => (await loadProducts()).map((p) => ({ slug: p.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> { const products = await loadProducts(); const { slug } = await params;
  const p = products.find((x) => x.slug === slug); return p ? { title: p.name, description: p.blurb, alternates: { canonical: `/products/${p.slug}` } } : {};
}
export default async function ProductPage({ params }: P) { const brands = await loadBrands(); const products = await loadProducts(); const { slug } = await params;
  const p = products.find((x) => x.slug === slug); if (!p) notFound();
  const brand = brands.find((b) => b.slug === p.brand);
  // No Offer/price markup: Khushio does not sell the product and has no verified, retailer-confirmed price to assert.
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.blurb, url: `${site.url}/products/${p.slug}`, image: p.image ? cld(p.image, 1200) : undefined, brand: brand ? { "@type": "Brand", name: brand.name } : undefined };
  return (
    <Page>
      <Breadcrumbs items={[{ name: (p.categoryLabel ?? catLabel(p.category)), href: `/categories/${p.category}` }, { name: p.name, href: `/products/${p.slug}` }]} />
      <JsonLd data={ld} />
      <div className="grid gap-10 md:grid-cols-2">
        {p.image ? <img src={cld(p.image, 900)} alt={p.name} width={900} height={900} className="aspect-square w-full rounded-card object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-card bg-sage/60 font-display text-3xl text-forest/60">{p.name}</div>}
        <div>
          <p className="text-sm text-ink/60">{(p.categoryLabel ?? catLabel(p.category))} · {brand ? <a className="underline" href={`/brands/${p.brand}`}>{brand.name}</a> : p.brand}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-forest">{p.name}</h1>
          <p className="mt-4 text-ink/80">{p.blurb}</p>
          <p className="mt-6 text-2xl font-semibold text-forest">{inr(p.price)}</p>
          <div className="mt-6 flex flex-col gap-3">
            {p.offers.map((o) => (<a key={o.id} href={`/go/${o.id}`} rel={AFFILIATE_REL} target="_blank" className="rounded-full bg-terracotta px-6 py-3 text-center font-medium text-white hover:bg-terracotta-600">View on {o.merchant}</a>))}
          </div>
          <p className="mt-3 text-sm">{p.offers.map((o) => <a key={o.id} href={`/stores/${slugify(o.merchant)}`} className="mr-4 underline">More from {o.merchant}</a>)}</p>
          <p className="mt-4 text-xs text-ink/60">Affiliate link: we may earn a commission at no extra cost to you. The price shown is indicative and may differ on the retailer’s site; check the retailer for the current price and availability.</p>
        </div>
      </div>
    </Page>
  );
}

export const revalidate = 60;
