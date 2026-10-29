import Link from "next/link";
import { site } from "@/lib/config/site";
type Crumb = { name: string; href: string };
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all = [{ name: "Home", href: "/" }, ...items];
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${site.url}${c.href === "/" ? "" : c.href}` })) };
  return (<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink/70"><ol className="flex flex-wrap gap-2">
      {all.map((c, i) => (<li key={c.href} className="flex gap-2">{i > 0 && <span aria-hidden>/</span>}{i === all.length - 1 ? <span aria-current="page">{c.name}</span> : <Link href={c.href} className="underline">{c.name}</Link>}</li>))}
    </ol></nav></>);
}
