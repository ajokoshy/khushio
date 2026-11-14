import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/core/config/env";
import { formatMinor } from "@/core/validation/money";
import { imageUrl } from "@/infrastructure/cloudinary";
import { getCategoryTrail } from "@/modules/discover/service";
import { getProductPage, getRelatedProducts, listTopProductSlugs } from "@/modules/catalog/service";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { ProductGrid } from "@/shared/catalog/product-card";
import { ProductImage } from "@/shared/catalog/product-image";

// Built ahead of time for the top products; any other published product is built on its first visit, then cached.
export const revalidate = 1800;

export async function generateStaticParams() {
  return (await listTopProductSlugs(50)).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductPage((await params).slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const image = product.images[0] ? imageUrl(product.images[0].publicId, "editorial") : null;
  const description = product.summary ?? product.description?.slice(0, 160) ?? `${product.name} on Khushio.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}/products/${product.slug}` },
    openGraph: { title: product.name, description, type: "website", ...(image ? { images: [{ url: image }] } : {}) },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProductPage((await params).slug);
  if (!product) notFound(); // drafts, archived and not-yet-live products are indistinguishable from missing ones

  const [trail, related] = await Promise.all([product.primaryCategoryId ? getCategoryTrail(product.primaryCategoryId) : Promise.resolve([]), getRelatedProducts(product)]);
  const [main, ...rest] = product.images;
  const paragraphs = (product.description ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <article className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Discover", href: "/discover" }, ...trail.map((c) => ({ label: c.name, href: `/categories/${c.slug}` })), { label: product.name }]} />

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          {/* The main picture is the largest thing on the screen, so it loads first. */}
          <ProductImage publicId={main?.publicId ?? null} alt={main?.alt ?? product.name} profiles={["product", "editorial"]} fallback="product" sizes="(min-width: 768px) 50vw, 100vw" width={800} height={800} priority className="aspect-square w-full rounded-card object-cover" />
          {rest.length > 0 && (
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {rest.map((image) => (
                <li key={image.publicId}>
                  <ProductImage publicId={image.publicId} alt={image.alt} profiles={["card"]} fallback="card" sizes="12vw" width={480} height={480} className="aspect-square w-full rounded-lg object-cover" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {product.brand && <p className="text-sm uppercase tracking-wide text-ink-600"><Link href={`/brands/${product.brand.slug}`} className="hover:underline">{product.brand.name}</Link></p>}
          <h1 className="mt-1 text-3xl">{product.name}</h1>
          {product.summary && <p className="mt-3 text-lg text-ink-600">{product.summary}</p>}

          {product.variants.length > 0 && (
            <section aria-labelledby="options-heading" className="mt-6">
              <h2 id="options-heading" className="text-lg">Options and prices</h2>
              <table className="mt-2 w-full text-sm">
                <caption className="sr-only">Options and prices for {product.name}</caption>
                <thead className="sr-only"><tr><th scope="col">Option</th><th scope="col">Price</th></tr></thead>
                <tbody>
                  {product.variants.map((v) => (
                    <tr key={v.id} className="border-b border-cream-200">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">{v.label}{v.sku ? <span className="ml-2 text-xs text-ink-600">SKU {v.sku}</span> : null}</th>
                      <td className="py-2 text-right font-medium">{v.priceMinor === null ? <span className="font-normal text-ink-600">See store</span> : formatMinor(v.priceMinor, v.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-600">Prices are shown as last checked and can change at the store.</p>
            </section>
          )}

          {product.links.length > 0 && (
            <section aria-labelledby="buy-heading" className="mt-6">
              <h2 id="buy-heading" className="text-lg">Where to buy</h2>
              <ul className="mt-2 flex flex-wrap gap-3">
                {product.links.map((link) => (
                  <li key={link.slug}>
                    {/* Affiliate link: sponsored and not followed by search engines. The redirect itself arrives in Release 4A. */}
                    <a href={`/go/${link.slug}`} rel="sponsored nofollow noopener" target="_blank" className="inline-block rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">Buy at {link.merchantName}</a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-600">We may earn a commission if you buy through these links, at no extra cost to you.</p>
            </section>
          )}
        </div>
      </div>

      {paragraphs.length > 0 && (
        <section aria-labelledby="about-heading" className="mt-10 max-w-prose">
          <h2 id="about-heading" className="text-xl">About this product</h2>
          {paragraphs.map((p, i) => <p key={i} className="mt-3 whitespace-pre-line">{p}</p>)}
        </section>
      )}

      {product.attributes.length > 0 && (
        <section aria-labelledby="specs-heading" className="mt-10 max-w-prose">
          <h2 id="specs-heading" className="text-xl">Details</h2>
          <dl className="mt-3 divide-y divide-cream-200 text-sm">
            {product.attributes.map((a, i) => (
              <div key={`${a.name}-${i}`} className="flex justify-between gap-4 py-2"><dt className="text-ink-600">{a.name}</dt><dd className="text-right">{a.value}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {product.tags.length > 0 && (
        <ul aria-label="Tags" className="mt-6 flex flex-wrap gap-2">
          {product.tags.map((t) => <li key={t}><Link href={`/discover?q=${encodeURIComponent(t)}`} className="inline-block rounded-full bg-cream-200 px-3 py-1 text-xs hover:bg-forest-100">{t}</Link></li>)}
        </ul>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="text-xl">You might also like</h2>
          <div className="mt-4"><ProductGrid cards={related.slice(0, 4)} /></div>
        </section>
      )}
    </article>
  );
}
