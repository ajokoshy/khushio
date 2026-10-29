"use client";
import Link from "next/link";
/** Shown when a page fails to load (for example the database is unreachable). Never shows error details to visitors. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (<div className="mx-auto max-w-xl px-5 py-24 text-center">
    <h1 className="font-display text-3xl font-semibold text-forest">Something went wrong</h1>
    <p className="mt-3 text-ink/75">We couldn’t load this page just now. Please try again in a moment.</p>
    <p className="mt-6 flex justify-center gap-6 text-sm"><button onClick={reset} className="rounded-full bg-forest px-5 py-2 font-medium text-ivory">Try again</button><Link className="self-center underline" href="/">Go to the home page</Link></p>
  </div>);
}
