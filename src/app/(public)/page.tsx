import Image from "next/image";

export const revalidate = 600; // homepage: 10 min (see core/config/cache.ts)

export default function HomePage() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-8">
      <div className="overflow-hidden rounded-card">
        <Image src="/brand/banner.png" alt="Khushio: discover more, save more, live happier" width={1983} height={793} priority className="h-auto w-full" />
      </div>
      <p className="mt-8 max-w-prose text-lg text-ink-600">
        The configurable homepage (hero, categories, deals, guides) is built in Phase 3 onward from registered section components.
      </p>
    </section>
  );
}
