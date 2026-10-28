import { Logo } from "./Logo";
import { enabled, legalLinks, site } from "@/lib/config/site";

export function Footer() {
  const links = enabled(legalLinks);
  return (
    <footer className="mt-24 bg-forest text-ivory">
      <div className="mx-auto max-w-page px-5 py-12">
        <div className="rounded-xl bg-ivory px-5 py-4 inline-block"><Logo tagline /></div>
        {links.length > 0 && (
          <nav aria-label="Footer" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {links.map((l) => (<a key={l.href} href={l.href} className="underline-offset-4 hover:underline">{l.label}</a>))}
          </nav>
        )}
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ivory/80">
          As an affiliate, {site.name} may earn a commission when you buy through links on this site, at no extra cost to you.
          Prices and availability are set by the retailer and can change.
        </p>
        <p className="mt-6 text-xs text-ivory/60">© {new Date().getFullYear()} {site.name}</p>
      </div>
    </footer>
  );
}
