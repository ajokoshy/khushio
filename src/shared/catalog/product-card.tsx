import Link from "next/link";
import { formatMinor } from "@/core/validation/money";
import type { CatalogCard } from "@/modules/catalog/types";
import { ProductImage } from "./product-image";

export function priceLabel(min: number | null, max: number | null): string {
  if (min === null) return "See price at the store";
  return max !== null && max !== min ? `From ${formatMinor(min, "INR")}` : formatMinor(min, "INR");
}

export function ProductCard({ card, priority = false }: { card: CatalogCard; priority?: boolean }) {
  return (
    <article className="group overflow-hidden rounded-card border border-cream-200 bg-cream-50">
      <Link href={`/products/${card.slug}`} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-800">
        <ProductImage
          publicId={card.imagePublicId}
          alt={card.imageAlt ?? card.name}
          profiles={["card", "product"]}
          fallback="card"
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw"
          width={480}
          height={480}
          priority={priority}
          className="aspect-square w-full object-cover"
        />
        <div className="p-3">
          {card.brandName && <p className="text-xs uppercase tracking-wide text-ink-600">{card.brandName}</p>}
          <h3 className="mt-1 line-clamp-2 text-base font-medium group-hover:underline">{card.name}</h3>
          <p className="mt-2 text-sm font-medium text-forest-800">{priceLabel(card.minPriceMinor, card.maxPriceMinor)}</p>
        </div>
      </Link>
    </article>
  );
}

export function ProductGrid({ cards }: { cards: CatalogCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card, index) => (
        <li key={card.id}>
          {/* The first row sits above the fold: load those images eagerly, the rest lazily. */}
          <ProductCard card={card} priority={index < 2} />
        </li>
      ))}
    </ul>
  );
}
