import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PriceTag } from "@/components/ProductCard";
import { AFFILIATE_REL } from "@/lib/affiliate/rules";
import { Img } from "@/components/Img";
import { catLabel, inr, type Brand, type Product } from "@/lib/data/catalog";
import { slugify } from "@/lib/slug";

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "");

/** Product detail body, shared by the public page and the admin preview. */
export function ProductView({ p, brand, crumbs, preview = false }: { p: Product; brand?: Brand; crumbs: { name: string; href: string }[]; preview?: boolean }) {
  const label = p.categoryLabel ?? catLabel(p.category);
  return (
    <>
      <Breadcrumbs items={[...crumbs, { name: p.name, href: `/products/${p.slug}` }]} />
      <div className="grid gap-10 md:grid-cols-2">
        {p.image ? <Img src={p.image} alt={p.name} width={960} height={960} priority sizes="(min-width: 768px) 50vw, 100vw" className="aspect-square w-full rounded-card object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-card bg-sage/60 font-display text-3xl text-forest/60">{p.name}</div>}
        <div>
          <p className="text-sm text-ink/60">{label} · {brand ? <a className="underline" href={`/brands/${p.brand}`}>{brand.name}</a> : p.brand}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-forest">{p.name}</h1>
          <p className="mt-4 text-ink/80">{p.blurb}</p>
          <p className="mt-6 text-2xl font-semibold text-forest"><PriceTag p={p} /></p>
          <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-forest">Where to buy</h2>
          {p.offers.length ? <ul className="divide-y divide-sand rounded-card border border-sand bg-white">{p.offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><a href={`/stores/${slugify(o.merchant)}`} className="font-medium text-forest underline">{o.merchant}</a>
                <p className="text-sm text-ink/70">{o.price ? <>{inr(o.price)}{o.mrp && o.mrp > o.price && <span className="ml-1 line-through text-ink/50">{inr(o.mrp)}</span>}</> : "Check the price at the retailer"}</p>
                <p className="text-xs text-ink/50">{o.price ? (o.checkedAt ? `Price checked ${day(o.checkedAt)}` : "Price not independently verified") : ""}{preview && o.inactive ? " · Hidden from visitors (inactive or expired)" : ""}</p></div>
              <a href={`/go/${o.id}`} rel={AFFILIATE_REL} target="_blank" className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-white hover:bg-terracotta-600">View on {o.merchant}</a>
            </li>))}</ul> : <p className="text-sm text-ink/70">No retailer links are available right now.</p>}
          <p className="mt-4 text-xs text-ink/60">Affiliate links: we may earn a commission at no extra cost to you. Prices are shown as last recorded and can differ on the retailer’s site; check the retailer for the current price and availability.</p>
        </div>
      </div>
    </>
  );
}
