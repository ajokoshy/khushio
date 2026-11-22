"use client";

import Link from "next/link";

/** Release 7B: what a visitor sees when a public page fails (the error itself is logged by src/instrumentation.ts). */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mt-3 text-ink-600">We could not load this page. It is usually brief, so please try again.</p>
      {error.digest && <p className="mt-2 text-xs text-ink-600">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-4">
        <button type="button" onClick={reset} className="rounded-full bg-forest-800 px-5 py-2 text-cream-50">Try again</button>
        <Link href="/" className="rounded-full border border-cream-200 px-5 py-2">Home page</Link>
      </div>
    </div>
  );
}
