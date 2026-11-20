import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { SECTION_LABELS, type SectionType } from "@/modules/homepage/config";
import { SECTION_STATE_LABELS, type PreviewSection, type ResolvedSection } from "@/modules/homepage/types";
import { ProductGrid } from "@/shared/catalog/product-card";
import { ProductImage } from "@/shared/catalog/product-image";
import { SITE } from "@/shared/constants/site";
import { ArticleGrid } from "@/shared/content/article-list";
import { DealGrid } from "@/shared/deals/deal-list";

/**
 * The registered components of the homepage builder (Release 6B). Each section type maps to ONE component below; the
 * database only chooses the type and supplies validated settings, never markup. Text is drawn by React (escaped), and
 * button addresses were checked (a path on this site or https) before they were stored and again before they are drawn.
 */

type Of<T extends ResolvedSection["type"]> = Extract<ResolvedSection, { type: T }>;

const sectionClass = "mx-auto mt-12 max-w-6xl px-4";
const buttonClass = "inline-block rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700";

/** A path on this site is a normal link; a full https address leaves the site. */
function ButtonLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return href.startsWith("/") ? <Link href={href} className={className}>{children}</Link> : <a href={href} rel="noopener" className={className}>{children}</a>;
}

function Heading({ id, text, moreHref, moreLabel }: { id: string; text: string | null; moreHref?: string; moreLabel?: string }) {
  if (!text) return null;
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <h2 id={id} className="text-2xl">{text}</h2>
      {moreHref && <Link href={moreHref} className="text-sm font-medium text-coral-600 underline underline-offset-2">{moreLabel}</Link>}
    </div>
  );
}

function Hero({ section }: { section: Of<"hero_banner"> }) {
  const c = section.config;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-8" aria-label={c.headline ?? SITE.name}>
      <div className="overflow-hidden rounded-card">
        {c.imagePublicId ? (
          <ProductImage publicId={c.imagePublicId} alt={c.imageAlt || c.headline || ""} profiles={["card", "product", "editorial"]} fallback="editorial" sizes="(min-width: 1152px) 1152px, 100vw" width={1983} height={793} priority className="h-auto w-full" />
        ) : (
          <Image src="/brand/banner.png" alt="Khushio: discover more, save more, live happier" width={1983} height={793} priority className="h-auto w-full" />
        )}
      </div>
      {(c.headline || c.subheadline || c.ctaHref) && (
        <div className="mt-6 max-w-prose">
          {c.headline && <h1 className="text-3xl leading-tight sm:text-4xl">{c.headline}</h1>}
          {c.subheadline && <p className="mt-2 text-lg text-ink-600">{c.subheadline}</p>}
          {c.ctaHref && c.ctaLabel && <p className="mt-4"><ButtonLink href={c.ctaHref} className={buttonClass}>{c.ctaLabel}</ButtonLink></p>}
        </div>
      )}
    </section>
  );
}

function FeaturedCategories({ section }: { section: Of<"featured_categories"> }) {
  const id = `home-${section.id}`;
  return (
    <section className={sectionClass} aria-labelledby={section.heading ? id : undefined}>
      <Heading id={id} text={section.heading} moreHref="/discover" moreLabel="Browse everything" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {section.categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/categories/${c.slug}`} className="flex h-full flex-col rounded-card border border-cream-200 bg-cream-50 p-4 hover:bg-forest-100">
              <span className="font-medium">{c.name}</span>
              {c.description && <span className="mt-1 line-clamp-2 text-sm text-ink-600">{c.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Trending({ section }: { section: Of<"trending_products"> }) {
  const id = `home-${section.id}`;
  return (
    <section className={sectionClass} aria-labelledby={section.heading ? id : undefined}>
      <Heading id={id} text={section.heading} moreHref="/discover" moreLabel="See all products" />
      <ProductGrid cards={section.cards} />
    </section>
  );
}

function Deals({ section }: { section: Of<"deals"> }) {
  const id = `home-${section.id}`;
  return (
    <section className={sectionClass} aria-labelledby={section.heading ? id : undefined}>
      <Heading id={id} text={section.heading} moreHref="/deals" moreLabel="All deals" />
      <DealGrid deals={section.deals} />
    </section>
  );
}

function Collections({ section }: { section: Of<"collections"> }) {
  const id = `home-${section.id}`;
  return (
    <section className={sectionClass} aria-labelledby={section.heading ? id : undefined}>
      <Heading id={id} text={section.heading} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {section.tiles.map((t) => (
          <li key={t.id}>
            <Link href={`/collections/${t.slug}`} className="flex h-full flex-col rounded-card border border-cream-200 bg-cream-50 p-4 hover:bg-forest-100">
              <span className="font-medium">{t.name}</span>
              {t.description && <span className="mt-1 line-clamp-2 text-sm text-ink-600">{t.description}</span>}
              <span className="mt-auto pt-3 text-xs text-ink-600">{t.productCount} {t.productCount === 1 ? "product" : "products"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Guides({ section }: { section: Of<"guides"> }) {
  const id = `home-${section.id}`;
  return (
    <section className={sectionClass} aria-labelledby={section.heading ? id : undefined}>
      <Heading id={id} text={section.heading} moreHref="/guides" moreLabel="All guides" />
      <ArticleGrid articles={section.articles} />
    </section>
  );
}

const TONES = { forest: "bg-forest-800 text-cream-50", coral: "bg-coral-100 text-coral-600", cream: "border border-cream-200 bg-cream-50" } as const;

function Promo({ section }: { section: Of<"promo_banner"> }) {
  const c = section.config;
  return (
    <section className={sectionClass} aria-label="Promotion">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-card px-5 py-4 ${TONES[c.tone]}`}>
        <p className="font-medium">{c.text}</p>
        {c.ctaHref && c.ctaLabel && <ButtonLink href={c.ctaHref} className="rounded-xl border border-current px-4 py-2 text-sm font-medium hover:opacity-80">{c.ctaLabel}</ButtonLink>}
      </div>
    </section>
  );
}

/** The registry: one component per section type. A new type needs an entry here, in config.ts and in the resolver. */
const COMPONENTS: { [K in SectionType]: (props: { section: Of<K> }) => ReactNode } = {
  hero_banner: Hero,
  featured_categories: FeaturedCategories,
  trending_products: Trending,
  deals: Deals,
  collections: Collections,
  guides: Guides,
  promo_banner: Promo,
};

function SectionView({ section }: { section: ResolvedSection }): ReactNode {
  // The registry is keyed by type, so the matching component always receives its own section shape.
  const Component = COMPONENTS[section.type] as (props: { section: ResolvedSection }) => ReactNode;
  return <Component section={section} />;
}

/** Every page needs one h1: when no hero shows a headline, a hidden one names the site. */
function PageTitle({ sections }: { sections: readonly ResolvedSection[] }) {
  const has = sections.some((s) => s.type === "hero_banner" && s.config.headline);
  return has ? null : <h1 className="sr-only">{SITE.name}: {SITE.tagline}</h1>;
}

export function HomepageSections({ sections }: { sections: readonly ResolvedSection[] }) {
  return (
    <>
      <PageTitle sections={sections} />
      {sections.map((s) => <SectionView key={s.id} section={s} />)}
      <div className="pb-2" />
    </>
  );
}

/** The signed preview: every section, with a label saying whether visitors see it. */
export function HomepagePreview({ sections }: { sections: readonly PreviewSection[] }) {
  const shown = sections.flatMap((s) => (s.section ? [s.section] : []));
  return (
    <>
      <PageTitle sections={shown} />
      {sections.map((s) => {
        const visible = s.state === "live" && s.section !== null;
        const note = s.state === "scheduled" && s.publishAt ? `Scheduled: goes live ${formatAdminDateTime(s.publishAt)}` : SECTION_STATE_LABELS[s.state];
        return (
          <div key={s.id} className={`mx-auto mt-10 max-w-6xl px-4 ${visible ? "" : "opacity-80"}`}>
            <p className={`rounded-t-xl px-3 py-1 text-xs font-medium ${visible ? "bg-forest-100 text-forest-800" : "bg-coral-100 text-coral-600"}`}>
              {SECTION_LABELS[s.type]} · {note}{s.problem ? ` · ${s.problem}` : ""}
            </p>
            <div className={`-mx-4 border-x border-b border-dashed pb-6 ${visible ? "border-forest-800" : "border-coral-600"}`}>
              {s.section ? <SectionView section={s.section} /> : <p className="px-4 pt-4 text-sm text-ink-600">{s.problem}</p>}
            </div>
          </div>
        );
      })}
    </>
  );
}
