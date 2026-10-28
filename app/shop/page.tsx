import type { Metadata } from "next";
import { Grid, Page, PageHead, ProductCard } from "@/components/ProductCard";
import { products } from "@/lib/data/catalog";
export const metadata: Metadata = { title: "Shop", description: "Browse all products on Khushio.", alternates: { canonical: "/shop" } };
export default async function Shop({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim().toLowerCase();
  const list = q ? products.filter((p) => `${p.name} ${p.blurb} ${p.brand}`.toLowerCase().includes(q)) : products;
  return (<Page><PageHead title={q ? `Results for “${q}”` : "Shop"} />{list.length ? <Grid>{list.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid> : <p>No products match yet. Try a broader word.</p>}</Page>);
}
