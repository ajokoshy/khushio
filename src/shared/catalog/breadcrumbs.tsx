import Link from "next/link";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";
import { JsonLdScript } from "@/shared/seo/json-ld";

export type Crumb = { label: string; href?: string };

/** The visible trail, plus the same trail as BreadcrumbList structured data (Release 7A), so every page that shows one also tells search engines. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-600">
      <JsonLdScript data={breadcrumbJsonLd(items)} />
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-2">
            {item.href ? <Link href={item.href} className="underline-offset-2 hover:underline">{item.label}</Link> : <span aria-current="page" className="text-ink">{item.label}</span>}
            {i < items.length - 1 && <span aria-hidden="true">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
