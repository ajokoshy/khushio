import type { RedirectStatus } from "./path";

export type RedirectSource = "auto" | "manual";
export const REDIRECT_SOURCE_LABELS: Record<RedirectSource, string> = { auto: "Automatic", manual: "Typed by hand" };

export type RedirectRow = {
  id: string;
  fromPath: string;
  toPath: string | null;
  statusCode: RedirectStatus;
  source: RedirectSource;
  createdAt: Date;
  updatedAt: Date;
};

export type RedirectWrite = { fromPath: string; toPath: string | null; statusCode: RedirectStatus };

/** A redirect rule whose old address is also the address of a page that exists: the page can never be reached while the rule is there. */
export type ShadowedRule = { rule: RedirectRow; page: string };

/** The public address of each kind of page, as the one place that knows them. `slug` is the page's own slug. */
export const PUBLIC_PATHS = {
  product: (slug: string) => `/products/${slug}`,
  category: (slug: string) => `/categories/${slug}`,
  brand: (slug: string) => `/brands/${slug}`,
  store: (slug: string) => `/stores/${slug}`,
  article: (slug: string) => `/articles/${slug}`,
  page: (slug: string) => `/p/${slug}`,
} as const;
export type PublicPathKind = keyof typeof PUBLIC_PATHS;
