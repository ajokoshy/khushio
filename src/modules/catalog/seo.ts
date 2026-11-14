import type { Metadata } from "next";
import { env } from "@/core/config/env";
import { isFilteredView } from "./filters";
import type { CatalogFilters } from "./types";

/** Filtered, searched and paged views are for people, not search engines: noindex, with the plain page as the canonical address. */
export function listingMetadata(opts: { title: string; description: string; path: string; filters: CatalogFilters }): Metadata {
  const filtered = isFilteredView(opts.filters);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}${opts.path}` },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}
