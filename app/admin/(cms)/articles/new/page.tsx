import { ArticleForm } from "@/components/admin/ArticleForm";
import { PageTitle } from "@/components/ui";
import { loadCategoriesAdmin } from "@/lib/data/journal-admin";
export const dynamic = "force-dynamic";
export default async function NewArticle({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  return (<div><PageTitle>New article</PageTitle><ArticleForm categories={await loadCategoriesAdmin()} error={(await searchParams).e} /></div>);
}
