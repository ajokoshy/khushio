import { PriceTag } from "@/components/ProductCard";
import { catLabel, type Product } from "@/lib/data/catalog";

/** Side-by-side comparison of 2 to 4 products. Shared by the interactive and the curated comparison pages. */
export function CompareTable({ items }: { items: Product[] }) {
  const rows: [string, (p: Product) => React.ReactNode][] = [["Price", (p) => <PriceTag p={p} />], ["Retailers", (p) => p.offers.filter((o) => !o.inactive).map((o) => o.merchant).join(", ") || "-"], ["Category", (p) => p.categoryLabel ?? catLabel(p.category)], ["Brand", (p) => p.brand || "-"], ["About", (p) => p.blurb]];
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[32rem] border-collapse text-left text-sm">
      <thead><tr><th className="p-3"><span className="sr-only">Feature</span></th>{items.map((p) => <th key={p.slug} scope="col" className="p-3 font-display text-lg text-forest"><a href={`/products/${p.slug}`}>{p.name}</a></th>)}</tr></thead>
      <tbody>{rows.map(([l, f]) => <tr key={l} className="border-t border-sand"><th scope="row" className="p-3 font-medium">{l}</th>{items.map((p) => <td key={p.slug} className="p-3">{f(p)}</td>)}</tr>)}</tbody></table></div>
  );
}
