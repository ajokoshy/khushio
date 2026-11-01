import { Logo } from "./Logo";
import { getNav } from "@/lib/nav";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/config/site";

const SOCIAL = [["social_instagram", "Instagram"], ["social_facebook", "Facebook"], ["social_x", "X"], ["social_youtube", "YouTube"]] as const;

export async function Footer() {
  const [links, s] = await Promise.all([getNav("footer"), getSettings()]);
  const social = SOCIAL.filter(([k]) => s[k]);
  return (
    <footer className="mt-24 bg-forest text-ivory">
      <div className="mx-auto max-w-page px-5 py-12">
        <div className="rounded-xl bg-ivory px-5 py-4 inline-block"><Logo tagline /></div>
        {links.length > 0 && (
          <nav aria-label="Footer" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {links.map((l) => (<a key={l.href + l.label} href={l.href} className="underline-offset-4 hover:underline" {...(l.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{l.label}</a>))}
          </nav>
        )}
        {social.length > 0 && <ul aria-label="Social media" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">{social.map(([k, label]) => <li key={k}><a href={s[k]} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{label}</a></li>)}</ul>}
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ivory/80">{s.footer_blurb}</p>
        {s.contact_email && <p className="mt-4 text-sm text-ivory/80">Contact: {s.contact_email}</p>}
        <p className="mt-6 text-xs text-ivory/60">© {new Date().getFullYear()} {site.name}</p>
      </div>
    </footer>
  );
}
