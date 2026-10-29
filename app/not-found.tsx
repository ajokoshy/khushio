import Link from "next/link";
import { Page } from "@/components/ProductCard";
export default function NotFound() {
  return (<Page><div className="mx-auto max-w-xl text-center">
    <p className="font-display text-6xl font-semibold text-terracotta">404</p>
    <h1 className="mt-3 font-display text-3xl font-semibold text-forest">We couldn’t find that page</h1>
    <p className="mt-3 text-ink/75">It may have moved, or the link may be out of date. Try a search or browse what’s new.</p>
    <form action="/shop" role="search" className="mx-auto mt-6 flex max-w-md items-center rounded-full border border-sand bg-white p-1.5">
      <label htmlFor="nf-q" className="sr-only">Search Khushio</label>
      <input id="nf-q" name="q" type="search" placeholder="Search products and brands" className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm outline-none" />
      <button className="rounded-full bg-forest px-5 py-2 text-sm font-medium text-ivory">Search</button></form>
    <p className="mt-6 flex justify-center gap-6 text-sm"><Link className="underline" href="/">Home</Link><Link className="underline" href="/shop">Shop</Link><Link className="underline" href="/deals">Deals</Link></p>
  </div></Page>);
}
