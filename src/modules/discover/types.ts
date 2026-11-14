export type StatusFilter = "all" | "active" | "archived";

export type CategoryRow = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

/** A category in depth-first order, ready for a list or a parent picker. */
export type CategoryListItem = CategoryRow & { depth: number; path: string };

export type CategoryUsage = { children: number; activeChildren: number; products: number };

export type ParentOption = { id: string; label: string; disabled?: boolean };

export type BrandRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
};

export type CategoryWrite = {
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

export type BrandWrite = {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  isFeatured: boolean;
};

/** A brand as a picker option or public page needs it. */
export type BrandOption = { id: string; slug: string; name: string };

/** A category for a public page: the category, the path above it, its active subcategories, and the ids a listing covers. */
export type PublicCategory = {
  category: CategoryRow;
  ancestors: CategoryRow[];
  children: CategoryRow[];
  /** The category itself and every active subcategory below it. Products in any of them belong on this page. */
  scopeIds: string[];
};
