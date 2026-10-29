import Image from "next/image";
import { CategoryStrip } from "@/components/CategoryStrip";
import { site } from "@/lib/config/site";
import { getSettings } from "@/lib/settings";
import { JsonLd } from "@/lib/seo/jsonld";

export const revalidate = 60;

export default async function Home() {
  const s = await getSettings();
  const jsonLd = {
    "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: site.url,
    potentialAction: { "@type": "SearchAction", target: `${site.url}/shop?q={search_term_string}`, "query-input": "required name=search_term_string" },
  };
  const org = { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: site.url, logo: `${site.url}/brand/khushio-logo.png` };
  return (
    <>
      <JsonLd data={[jsonLd, org]} />
      <section className="bg-gradient-to-br from-ivory via-cream to-sage/50">
        <div className="mx-auto grid max-w-page items-center gap-10 px-5 py-12 lg:grid-cols-2 lg:py-20">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[1.08] text-forest sm:text-6xl">
              {s.hero_title.split("\n").map((l, i) => <span key={i} className="block">{l}</span>)}
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/80">
              {s.hero_subtitle}
            </p>
            <form action="/shop" role="search" className="mt-8 flex max-w-xl items-center rounded-full border border-sand bg-white p-1.5 shadow-sm">
              <label htmlFor="q" className="sr-only">Search products, brands and deals</label>
              <input id="q" name="q" type="search" placeholder={s.search_placeholder} className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-ink/50" />
              <button type="submit" className="rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-ivory hover:bg-forest-700">Search</button>
            </form>
          </div>
          <div className="relative aspect-[1123/625] overflow-hidden rounded-card">
            <Image src="/images/hero.jpg" alt="A Khushio shopping bag with a straw hat, sunglasses and a terracotta scarf" fill priority sizes="(min-width:1024px) 600px, 100vw" className="object-cover" />
          </div>
        </div>
      </section>
      <section aria-label="Shop by category" className="mx-auto max-w-page px-5 pt-12">
        <CategoryStrip />
      </section>
    </>
  );
}
