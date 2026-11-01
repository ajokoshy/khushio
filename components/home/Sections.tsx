import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { ArticleCard } from "@/components/ArticleCard";
import { CategoryStrip } from "@/components/CategoryStrip";
import { Img } from "@/components/Img";
import { Grid, ProductCard } from "@/components/ProductCard";
import { features } from "@/lib/config/site";
import { loadBrands, loadCategories, loadCollections, loadCoupons, loadDeals, loadProductsBySlugs, loadStores, searchProducts } from "@/lib/data/catalog";
import { listArticles } from "@/lib/data/journal";
import type { MediaInfo } from "@/lib/data/media";
import { loadOccasions } from "@/lib/data/occasions";
import type { HomeSection } from "@/lib/home/data";
import { parseTrustItems, resolveConfig } from "@/lib/home/sections";
import { safeHref } from "@/lib/markdown";
import type { SettingKey } from "@/lib/settings-schema";

type Settings = Record<SettingKey, string>;
type Media = Record<string, MediaInfo>;
const chip = "rounded-full border border-sand bg-white px-4 py-1.5 text-sm hover:border-terracotta";

function Shell({ id, title, subtitle, more, children }: { id: string; title?: string; subtitle?: string; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <section aria-labelledby={title ? `h-${id}` : undefined} aria-label={title ? undefined : "Section"} className="mx-auto max-w-page px-5 pt-14">
      {(title || more) && <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div>{title && <h2 id={`h-${id}`} className="font-display text-3xl font-semibold text-forest">{title}</h2>}{subtitle && <p className="mt-1 text-ink/70">{subtitle}</p>}</div>{more && <a className="text-sm font-medium text-forest underline underline-offset-2" href={more.href}>{more.label}</a>}</div>}
      {children}
    </section>
  );
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

function Hero({ c, s, media }: { c: ReturnType<typeof resolveConfig>; s: Settings; media: Media }) {
  const split = c.variant !== "centered", img = typeof c.image === "string" ? media[c.image] : undefined, cta = s.hero_cta_label && safeHref(s.hero_cta_href);
  return (
    <section className="bg-gradient-to-br from-ivory via-cream to-sage/50">
      <div className={`mx-auto grid max-w-page items-center gap-10 px-5 py-12 lg:py-20 ${split ? "lg:grid-cols-2" : "justify-items-center text-center"}`}>
        <div>
          <h1 className="font-display text-5xl font-semibold leading-[1.08] text-forest sm:text-6xl">{s.hero_title.split("\n").map((l, i) => <span key={i} className="block">{l}</span>)}</h1>
          <p className={`mt-6 max-w-md text-lg leading-relaxed text-ink/80 ${split ? "" : "mx-auto"}`}>{s.hero_subtitle}</p>
          <form action="/shop" role="search" className={`mt-8 flex max-w-xl items-center rounded-full border border-sand bg-white p-1.5 shadow-sm ${split ? "" : "mx-auto"}`}>
            <label htmlFor="q" className="sr-only">Search products, brands and deals</label>
            <input id="q" name="q" type="search" placeholder={s.search_placeholder} maxLength={80} className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-ink/50" />
            <button type="submit" className="rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-ivory hover:bg-forest-700">Search</button>
          </form>
          {cta && <a href={cta.href} className="mt-5 inline-block rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-white hover:bg-terracotta-600">{s.hero_cta_label}</a>}
        </div>
        {split && <div className="relative aspect-[1123/625] w-full overflow-hidden rounded-card">
          {img ? <Img src={img.publicId} alt={img.alt} width={960} height={534} originalWidth={img.width} priority sizes="(min-width: 1024px) 600px, 100vw" className="h-full w-full object-cover" />
            : <Img src="/images/hero.jpg" alt="A Khushio shopping bag with a straw hat, sunglasses and a terracotta scarf" width={1123} height={625} priority sizes="(min-width: 1024px) 600px, 100vw" className="h-full w-full object-cover" />}
        </div>}
      </div>
    </section>
  );
}

export async function HomeSectionView({ section, settings, media }: { section: HomeSection; settings: Settings; media: Media }) {
  const c = resolveConfig(section.type, section.config), id = section.id, title = str(c.title), sub = str(c.subtitle), n = Number(c.limit) || 4;
  switch (section.type) {
    case "hero": return <Hero c={c} s={settings} media={media} />;
    case "category_strip": return <Shell id={id} title={title || undefined}><CategoryStrip /></Shell>;
    case "featured_products": case "new_arrivals": {
      const items = (await searchProducts({ sort: section.type === "new_arrivals" ? "newest" : "featured", pageSize: n })).items; if (!items.length) return null;
      return <Shell id={id} title={title} subtitle={sub} more={features.shop ? { href: "/shop", label: "See all" } : undefined}><Grid>{items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid></Shell>;
    }
    case "product_row": { const items = await loadProductsBySlugs((c.slugs as string[]) ?? []); if (!items.length) return null; return <Shell id={id} title={title} subtitle={sub}><Grid>{items.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid></Shell>; }
    case "deals": {
      const items = (await loadDeals()).slice(0, n); if (!items.length || !features.deals) return null;
      return <Shell id={id} title={title} subtitle={sub} more={{ href: "/deals", label: "All deals" }}><ul className="grid gap-4 md:grid-cols-3">{items.map((d) => <li key={d.slug} className="rounded-card border border-sand bg-white p-5"><h3 className="font-display text-xl font-semibold text-forest"><a href={`/deals/${d.slug}`}>{d.title}</a></h3><p className="mt-1 text-sm text-ink/60">{d.merchant}{d.ends ? ` · ends ${d.ends}` : ""}</p></li>)}</ul></Shell>;
    }
    case "coupons": {
      const items = (await loadCoupons()).slice(0, n); if (!items.length || !features.coupons) return null;
      return <Shell id={id} title={title} more={{ href: "/coupons", label: "All coupons" }}><ul className="grid gap-4 md:grid-cols-3">{items.map((x) => <li key={x.offerId} className="rounded-card border border-dashed border-terracotta bg-white p-5"><p className="font-mono text-lg font-semibold text-forest">{x.code}</p><p className="mt-1 text-sm text-ink/70">{x.merchant}: {x.detail}</p></li>)}</ul></Shell>;
    }
    case "best_picks": {
      const cats = (await loadCategories()).filter((x) => !x.parentId).slice(0, n); const tops = (await Promise.all(cats.map(async (x) => (await searchProducts({ categories: [x.slug], sort: "saving", pageSize: 1 })).items[0]))).filter(Boolean);
      if (!tops.length) return null; return <Shell id={id} title={title} more={features.bestPicks ? { href: "/best-picks", label: "See all" } : undefined}><Grid>{tops.map((p) => <ProductCard key={p.slug} p={p} />)}</Grid></Shell>;
    }
    case "brands": { const items = (await loadBrands()).slice(0, n); if (!items.length || !features.brands) return null; return <Shell id={id} title={title} more={{ href: "/brands", label: "All brands" }}><ul className="flex flex-wrap gap-2">{items.map((b) => <li key={b.slug}><a className={chip} href={`/brands/${b.slug}`}>{b.name}</a></li>)}</ul></Shell>; }
    case "collections": {
      const items = (await loadCollections()).slice(0, n); if (!items.length || !features.collections) return null;
      return <Shell id={id} title={title} more={{ href: "/collections", label: "All collections" }}><ul className="grid gap-4 md:grid-cols-3">{items.map((x) => <li key={x.slug} className="rounded-card border border-sand bg-white p-5"><h3 className="font-display text-xl font-semibold text-forest"><a href={`/collections/${x.slug}`}>{x.title}</a></h3>{x.description && <p className="mt-1 text-sm text-ink/70">{x.description}</p>}</li>)}</ul></Shell>;
    }
    case "journal_latest": {
      const items = (await listArticles({ category: str(c.category) || undefined })).items.slice(0, n); if (!items.length || !features.journal) return null;
      return <Shell id={id} title={title} more={{ href: "/journal", label: "Read more" }}><Grid>{items.map((a) => <ArticleCard key={a.slug} a={a} />)}</Grid></Shell>;
    }
    case "gift_finder": {
      if (!features.gifts) return null; const occ = await loadOccasions();
      return <Shell id={id} title={title} subtitle={sub}><ul className="flex flex-wrap gap-2">{occ.map((o) => <li key={o.slug}><a className={chip} href={`/gifts/${o.slug}`}>{o.title}</a></li>)}{[500, 1000, 2000].map((b) => <li key={b}><a className={chip} href={`/gifts?under=${b}`}>Under ₹{b}</a></li>)}</ul></Shell>;
    }
    case "trust_strip": {
      const items = parseTrustItems(str(c.items)); if (!items.length) return null;
      return <Shell id={id} title={title || undefined}><ul className="grid gap-4 md:grid-cols-3">{items.map((t) => <li key={t.heading} className="flex gap-3 rounded-card bg-sage/40 p-5"><CheckCircle2 className="mt-0.5 shrink-0 text-forest" size={22} aria-hidden /><div><p className="font-medium text-forest">{t.heading}</p><p className="text-sm text-ink/75">{t.text}</p></div></li>)}</ul></Shell>;
    }
    case "newsletter": {
      const url = settings.newsletter_form_url; if (!url) return null;
      return <Shell id={id}><div className="rounded-card bg-forest p-8 text-center text-ivory"><h2 id={`h-${id}`} className="font-display text-2xl font-semibold">{title || settings.newsletter_title}</h2>{sub && <p className="mt-2 text-ivory/80">{sub}</p>}<a href={url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-white hover:bg-terracotta-600">Subscribe</a></div></Shell>;
    }
    case "banner": {
      const img = typeof c.image === "string" ? media[c.image] : undefined, link = str(c.cta_href) && safeHref(str(c.cta_href)), accent = c.variant === "accent";
      return <Shell id={id}><div className={`grid items-center gap-6 rounded-card p-8 ${img ? "md:grid-cols-2" : ""} ${accent ? "bg-terracotta text-white" : "border border-sand bg-white"}`}><div><h2 className="font-display text-3xl font-semibold">{title}</h2>{str(c.text) && <p className="mt-3 max-w-xl">{str(c.text)}</p>}
        {link && str(c.cta_label) && <a href={link.href} className={`mt-5 inline-block rounded-full px-6 py-2.5 text-sm font-medium ${accent ? "bg-white text-terracotta" : "bg-forest text-ivory"}`}>{str(c.cta_label)}</a>}</div>
        {img && <Img src={img.publicId} alt={img.alt} width={640} height={400} originalWidth={img.width} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[8/5] w-full rounded-card object-cover" />}</div></Shell>;
    }
    case "stores": { const items = await loadStores(n); if (!items.length) return null; return <Shell id={id} title={title}><ul className="flex flex-wrap gap-2">{items.map((x) => <li key={x.slug}><a className={chip} href={`/stores/${x.slug}`}>{x.name}</a></li>)}</ul></Shell>; }
  }
}
