import type { Metadata } from "next";
import { ArticleCard } from "@/components/ArticleCard";
import { Pagination } from "@/components/Listing";
import { Grid, Page, PageHead } from "@/components/ProductCard";
import { listArticles, loadJournalCategories } from "@/lib/data/journal";
import { slugify } from "@/lib/slug";
type SP = Promise<{ page?: string; tag?: string }>;
// Scheduled articles go live by time, so this page refreshes every 30 minutes (and instantly when an admin saves).
export const revalidate = 1800;
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams, page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  return { title: page > 1 ? `Journal (page ${page})` : "Journal", description: "Guides, ideas and gift inspiration.", alternates: { canonical: page > 1 && !sp.tag ? `/journal?page=${page}` : "/journal" }, robots: sp.tag ? { index: false, follow: true } : undefined };
}
export default async function Journal({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams, tag = slugify(sp.tag ?? "") || undefined;
  const [list, cats] = await Promise.all([listArticles({ page: Math.floor(Number(sp.page)) || 1, tag }), loadJournalCategories()]);
  return (<Page><PageHead title={tag ? `Journal: #${tag}` : "Journal"} intro="Guides, ideas and gift inspiration." />
    {cats.some((c) => c.count) && <ul aria-label="Categories" className="mb-8 flex flex-wrap gap-2 text-sm">{cats.filter((c) => c.count).map((c) => <li key={c.slug}><a className="rounded-full border border-sand bg-white px-4 py-1.5 hover:border-terracotta" href={`/journal/${c.slug}`}>{c.name}</a></li>)}</ul>}
    {list.items.length ? <><Grid>{list.items.map((a) => <ArticleCard key={a.slug} a={a} />)}</Grid><Pagination path="/journal" params={{ tag }} page={list.page} pages={list.pages} /></> : <p>{tag ? "No articles with this tag yet." : "Articles are coming soon."}</p>}</Page>);
}
