import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, PageHead } from "@/components/ProductCard";
import { Prose } from "@/components/Prose";
import { parseMarkdown } from "@/lib/markdown";
import { loadPage, loadPageSlugs } from "@/lib/pages";
type P = { params: Promise<{ legal: string }> };
// Regenerated on demand when an admin edits a page (the "pages" tag); once a day otherwise.
export const revalidate = 86400;
export const generateStaticParams = async () => (await loadPageSlugs()).map((legal) => ({ legal }));
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const slug = (await params).legal, p = await loadPage(slug);
  return p ? { title: p.title, description: p.description || undefined, alternates: { canonical: `/${slug}` } } : {};
}
export default async function SitePageRoute({ params }: P) {
  const p = await loadPage((await params).legal); if (!p) notFound();
  return (<Page><PageHead title={p.title} /><div className="max-w-2xl"><Prose blocks={parseMarkdown(p.body)} /></div></Page>);
}
