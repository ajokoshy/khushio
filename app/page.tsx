import type { Metadata } from "next";
import { HomeSectionView } from "@/components/home/Sections";
import { site } from "@/lib/config/site";
import { loadMediaMap } from "@/lib/data/media";
import { loadHomeSections } from "@/lib/home/data";
import { visibility } from "@/lib/home/sections";
import { JsonLd } from "@/lib/seo/jsonld";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Sections can be scheduled, so the page refreshes every 30 minutes; saving anything in the admin refreshes it immediately.
export const revalidate = 1800;

export default async function Home() {
  const [all, settings] = await Promise.all([loadHomeSections(), getSettings()]);
  const now = new Date(), live = all.filter((s) => visibility(s, now) === "live");
  const media = await loadMediaMap(live.map((s) => s.config.image).filter((v): v is string => typeof v === "string"));
  const web = { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: site.url, potentialAction: { "@type": "SearchAction", target: `${site.url}/shop?q={search_term_string}`, "query-input": "required name=search_term_string" } };
  const org = { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: site.url, logo: `${site.url}/brand/khushio-logo.png` };
  return (<><JsonLd data={[web, org]} />{live.map((s) => <HomeSectionView key={s.id} section={s} settings={settings} media={media} />)}</>);
}
