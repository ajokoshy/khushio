import Link from "next/link";
import { SiteHeader } from "@/shared/layouts/site-header";
import { SiteFooter } from "@/shared/layouts/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-4xl">We couldn&apos;t find that page</h1>
          <p className="mt-3 text-ink-600">It may have moved or no longer exists.</p>
          <Link href="/" className="mt-6 inline-block rounded-full bg-forest-800 px-6 py-3 text-cream-50 hover:bg-forest-700">Back to home</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
