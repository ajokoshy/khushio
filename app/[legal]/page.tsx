import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, PageHead } from "@/components/ProductCard";
const pages: Record<string, { title: string; body: string[] }> = {
  about: { title: "About Khushio", body: ["Khushio helps shoppers in India discover good products, real deals and emerging brands in one place.", "We are a discovery site. You complete purchases on the retailer’s own website."] },
  contact: { title: "Contact", body: ["Questions or partnership ideas? Write to hello@khushio.com."] },
  "affiliate-disclosure": { title: "Affiliate disclosure", body: ["Some links on Khushio are affiliate links. If you buy through them we may earn a commission at no extra cost to you.", "Commissions never decide which products we recommend."] },
  "privacy-policy": { title: "Privacy policy", body: ["We collect only the data needed to run the site, such as anonymous visit and affiliate click counts.", "We do not sell personal data. This is a starter text: have it reviewed before launch."] },
  "terms-and-conditions": { title: "Terms and conditions", body: ["Prices, offers and availability come from third-party retailers and can change without notice.", "This is a starter text: have it reviewed before launch."] },
};
type P = { params: Promise<{ legal: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(pages).map((legal) => ({ legal }));
export async function generateMetadata({ params }: P): Promise<Metadata> { const p = pages[(await params).legal]; return p ? { title: p.title, alternates: { canonical: `/${(await params).legal}` } } : {}; }
export default async function Legal({ params }: P) {
  const p = pages[(await params).legal]; if (!p) notFound();
  return (<Page><PageHead title={p.title} /><div className="max-w-2xl space-y-4 leading-7">{p.body.map((t, i) => <p key={i}>{t}</p>)}</div></Page>);
}
