"use client";

import { useState } from "react";

type Props = { code: string; /** The deal's /go link. Opening it is what records the affiliate click. */ linkSlug: string | null; label?: string };

/**
 * "Show code": reveals and copies the coupon code. When the offer has an affiliate link, revealing opens /go/<slug> in a
 * new tab, so the click is counted by the same redirect as every Buy button (Release 5A). The code is in the page data
 * (it is public), the reveal is about the click and the copy, not secrecy.
 */
export function CouponReveal({ code, linkSlug, label = "Show code" }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  }

  function reveal() {
    setRevealed(true);
    if (linkSlug) window.open(`/go/${linkSlug}`, "_blank", "noopener");
    void copy();
  }

  if (!revealed) {
    return (
      <button type="button" onClick={reveal} className="rounded-xl border border-dashed border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100">
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="rounded-lg bg-cream-200 px-3 py-1.5 text-sm font-semibold tracking-wide">{code}</code>
      <button type="button" onClick={() => void copy()} className="rounded-xl border border-forest-800 px-3 py-1.5 text-xs font-medium hover:bg-forest-100">Copy</button>
      <span role="status" aria-live="polite" className="text-xs text-ink-600">{copied === "yes" ? "Copied" : copied === "no" ? "Copy it by hand" : ""}</span>
    </span>
  );
}
