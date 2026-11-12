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
