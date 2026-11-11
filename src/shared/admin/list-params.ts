export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export type ListParams = { page: number; pageSize: number; offset: number; q: string | undefined };

/** Parses ?page=&q= from the URL. Anything malformed falls back to safe defaults. */
export function parseListParams(sp: SearchParams, opts: { pageSize?: number; maxPage?: number } = {}): ListParams {
  const pageSize = opts.pageSize ?? 25;
  const maxPage = opts.maxPage ?? 1000;
  const rawPage = Number(firstParam(sp.page));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, maxPage) : 1;
  const q = firstParam(sp.q)?.trim().slice(0, 100) || undefined;
  return { page, pageSize, offset: (page - 1) * pageSize, q };
}

/** Builds a URL, leaving out empty values so links stay short. */
export function buildHref(basePath: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    usp.set(key, value === true ? "1" : String(value));
  }
  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
