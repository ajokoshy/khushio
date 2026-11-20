import Link from "next/link";
import type { EmbedProduct } from "@/modules/catalog/types";
import { AffiliateLink } from "@/shared/catalog/affiliate-link";
import { priceLabel } from "@/shared/catalog/product-card";
import { ProductImage } from "@/shared/catalog/product-image";

/**
 * A product inside an article (Release 6B). Everything shown is read live from the catalogue by the page (price, picture,
 * store link); the article stores only the id. A product that is archived or not live is not passed in, and the renderer
 * leaves it out, so there is never a broken card.
 */
export function ProductEmbedCard({ product }: { product: EmbedProduct }) {
  return (
    <aside aria-label={`Product: ${product.name}`} className="my-6 flex gap-4 rounded-card border border-cream-200 bg-cream-50 p-3 text-base leading-normal">
      <Link href={`/products/${product.slug}`} tabIndex={-1} aria-hidden="true" className="block w-24 shrink-0 sm:w-32">
        <ProductImage publicId={product.imagePublicId} alt="" profiles={["card", "product"]} fallback="card" sizes="128px" width={256} height={256} className="aspect-square w-full rounded-xl object-cover" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        {product.brandName && <p className="text-xs uppercase tracking-wide text-ink-600">{product.brandName}</p>}
        <p className="mt-0.5 font-medium"><Link href={`/products/${product.slug}`} className="hover:underline">{product.name}</Link></p>
        {product.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-600">{product.summary}</p>}
        <p className="mt-2 text-sm font-medium text-forest-800">{priceLabel(product.minPriceMinor, product.maxPriceMinor)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {product.linkSlug && <AffiliateLink slug={product.linkSlug}>{product.merchantName ? `Buy at ${product.merchantName}` : "See the offer"}</AffiliateLink>}
          <Link href={`/products/${product.slug}`} className="text-sm font-medium text-coral-600 underline underline-offset-2">Details</Link>
        </div>
      </div>
    </aside>
  );
}
