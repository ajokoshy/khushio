"use client";

/** Release 7B: the last safety net, used only when the root layout itself fails. Plain HTML, no site styles, no imports that could fail. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: "32rem", margin: "6rem auto", padding: "0 1rem", textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>
        {error.digest && <p style={{ fontSize: "0.75rem" }}>Reference: {error.digest}</p>}
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1.25rem" }}>Try again</button>
      </body>
    </html>
  );
}
