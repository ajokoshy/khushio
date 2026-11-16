import type { ReactNode } from "react";

/**
 * Every outbound product link goes through /go and carries these attributes (Release 4A): "sponsored" and "nofollow"
 * tell search engines it is paid, "noopener" stops the store page from reaching back into this tab.
 */
export const AFFILIATE_REL = "sponsored nofollow noopener";

export function AffiliateLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <a
      href={`/go/${slug}`}
      rel={AFFILIATE_REL}
      target="_blank"
      className="inline-block rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700"
    >
      {children}
    </a>
  );
}
