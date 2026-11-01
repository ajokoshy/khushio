import { Img } from "@/components/Img";
import Link from "next/link";
import { cld } from "@/lib/cloudinary";
import { catLabel, inr, type Product } from "@/lib/data/catalog";

/** Price line. "From" when several retailers have prices; "approx." when the price is only our reference price (no retailer price on file). */
export function PriceTag({ p }: { p: Product }) {
  const priced = p.offers.filter((o) => o.price && !o.inactive).length;
  return (<>{priced > 1 && <span className="mr-1 text-xs font-normal text-ink/60">From</span>}{inr(p.price)} {p.mrp && <span className="ml-1 text-sm font-normal text-ink/50 line-through">{inr(p.mrp)}</span>}{p.priceIsReference && <span className="ml-1 text-xs font-normal text-ink/50">approx.</span>}</>);
}

export function ProductCard({ p }: { p: Product }) {
  return (
    <Link href={`/products/${p.slug}`} className="group flex flex-col overflow-hidden rounded-card border border-sand bg-white">
      {p.image ? <Img src={p.image} alt={p.name} width={640} height={480} sizes="(min-width: 1024px) 25vw, 50vw" className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-sage/60 font-display text-2xl text-forest/60">{p.name.split(" ")[0]}</div>}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs text-ink/60">{(p.categoryLabel ?? catLabel(p.category))}</span>
        <h3 className="font-display text-lg font-semibold text-forest group-hover:text-terracotta">{p.name}</h3>
        <p className="text-sm text-ink/70">{p.blurb}</p>
        <p className="mt-auto pt-2 font-medium text-forest"><PriceTag p={p} /></p>
      </div>
    </Link>
  );
}
export const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
export const PageHead = ({ title, intro }: { title: string; intro?: string }) => (
  <div className="mb-8"><h1 className="font-display text-4xl font-semibold text-forest">{title}</h1>{intro && <p className="mt-3 max-w-2xl text-ink/75">{intro}</p>}</div>
);
export const Page = ({ children }: { children: React.ReactNode }) => <div className="mx-auto max-w-page px-5 py-12">{children}</div>;
