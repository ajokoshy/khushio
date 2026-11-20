import { listCollectionOptions } from "@/modules/catalog/service";
import { ARTICLE_TYPE_PLURALS, GUIDE_TYPES } from "@/modules/content/types";
import { listCategoryChoices } from "@/modules/discover/service";

/** The choices the section form offers: active categories (indented tree), active collections and the kinds of guide. */
export async function loadSectionFormOptions(keepCategoryIds: readonly string[] = []) {
  const [categories, collections] = await Promise.all([listCategoryChoices(keepCategoryIds), listCollectionOptions()]);
  return {
    categories: categories.map((c) => ({ id: c.id, label: c.label })),
    collections: collections.map((c) => ({ id: c.id, label: c.name })),
    guideTypes: GUIDE_TYPES.map((t) => ({ id: t as string, label: ARTICLE_TYPE_PLURALS[t] })),
  };
}
