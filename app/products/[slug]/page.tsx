import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/ProductCard";
import { brands, catLabel, inr, loadProducts } from "@/lib/data/catalog";
type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = async () => (await loadProducts()).map((p) => ({ slug: p.slug }));
export async function generateMetadata({ params }: P): Promise<Metadata> { const products = await loadProducts(); const { slug } = await params;
  const p = products.find((x) => x.slug === slug); return p ? { title: p.name, description: p.blurb, alternates: { canonical: `/products/${p.slug}` } } : {};
}
export default async function ProductPage({ params }: P) { const products = await loadProducts(); const { slug } = await params;
  const p = products.find((x) => x.slug === slug); if (!p) notFound();
  const brand = brands.find((b) => b.slug === p.brand);
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.blurb, brand: brand?.name, offers: { "@type": "Offer", priceCurrency: "INR", price: p.price } };
  return (
    <Page>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="grid gap-10 md:grid-cols-2">
        <div className="flex aspect-square items-center justify-center rounded-card bg-sage/60 font-display text-3xl text-forest/60">{p.name}</div>
        <div>
          <p className="text-sm text-ink/60">{catLabel(p.category)} · {brand ? <a className="underline" href={`/brands/${p.brand}`}>{brand.name}</a> : p.brand}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-forest">{p.name}</h1>
          <p className="mt-4 text-ink/80">{p.blurb}</p>
          <p className="mt-6 text-2xl font-semibold text-forest">{inr(p.price)}</p>
          <div className="mt-6 flex flex-col gap-3">
            {p.offers.map((o) => (<a key={o.id} href={`/go/${o.id}`} rel="sponsored nofollow noopener" target="_blank" className="rounded-full bg-terracotta px-6 py-3 text-center font-medium text-white hover:bg-terracotta-600">View on {o.merchant}</a>))}
          </div>
          <p className="mt-4 text-xs text-ink/60">Affiliate link: we may earn a commission at no extra cost to you. Price shown may change on the retailer’s site.</p>
        </div>
      </div>
    </Page>
  );
}

export const revalidate = 60;
