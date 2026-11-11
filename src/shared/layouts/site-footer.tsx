import { SITE } from "@/shared/constants/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-cream-200 py-10 text-sm text-ink-600">
      <div className="mx-auto max-w-6xl px-4">
        <p className="font-display text-lg text-forest-800">{SITE.name}</p>
        <p>{SITE.tagline}</p>
        <p className="mt-4">Some links on Khushio are affiliate links. We may earn a commission at no extra cost to you.</p>
      </div>
    </footer>
  );
}
