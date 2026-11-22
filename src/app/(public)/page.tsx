import Image from "next/image";
import { env } from "@/core/config/env";
import { getHomepage } from "@/modules/homepage/service";
import type { Metadata } from "next";
import { absoluteUrl } from "@/modules/seo/metadata";
import { HomepageSections } from "@/shared/homepage/sections";

export const metadata: Metadata = { alternates: { canonical: absoluteUrl("/") } };

export const revalidate = 600; // homepage: 10 min (CACHE_TTL.homepage in core/config/cache.ts); every homepage admin write refreshes it at once

/** `next build` without a database (CI, forks) prerenders the plain banner; the 10-minute revalidate fills in the real page at runtime. */
const buildingWithoutDatabase = process.env.NEXT_PHASE === "phase-production-build" && !env.DATABASE_URL;

export default async function HomePage() {
  const sections = buildingWithoutDatabase ? [] : await getHomepage();
  if (sections.length > 0) return <HomepageSections sections={sections} />;
  // No live sections yet (a new site, or everything switched off): the brand banner alone. Admin > Homepage can create the starter layout.
  return (
    <section className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="sr-only">Khushio: discover more, save more, live happier</h1>
      <div className="overflow-hidden rounded-card">
        <Image src="/brand/banner.png" alt="Khushio: discover more, save more, live happier" width={1983} height={793} priority className="h-auto w-full" />
      </div>
    </section>
  );
}
