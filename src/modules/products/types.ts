export const PRODUCT_STATUSES = ["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED", "DISCONTINUED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "In review",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  DISCONTINUED: "Discontinued",
};

export type ProductFilter = "all" | ProductStatus;

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  brandId: string | null;
  status: ProductStatus;
  publishAt: Date | null;
  isFeatured: boolean;
};

export type ProductListRow = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  publishAt: Date | null;
  isFeatured: boolean;
  brandName: string | null;
  categoryName: string | null;
  updatedAt: Date;
};

export type VariantRow = {
  id: string;
  sku: string | null;
  label: string;
  priceMinor: number | null;
  currency: string;
  sortOrder: number;
};

export type ProductImageRow = { id: string; publicId: string; alt: string; sortOrder: number };
export type AttributeRow = { name: string; value: string };

export type ProductDetail = {
  product: ProductRow;
  /** Every category the product is in, the primary one included. */
  categoryIds: string[];
  primaryCategoryId: string | null;
  attributes: AttributeRow[];
  tags: string[];
  variants: VariantRow[];
  images: ProductImageRow[];
};

/** The product's own columns, ready to write. */
export type ProductWrite = {
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  brandId: string | null;
  status: ProductStatus;
  publishAt: Date | null;
  isFeatured: boolean;
};

export type VariantWrite = {
  /** Always set: existing variants keep their id, new ones get one before the write. */
  id: string;
  sku: string | null;
  label: string;
  priceMinor: number | null;
  currency: string;
  sortOrder: number;
};

/** Everything saved together with a product in one atomic write. */
export type ProductGraph = {
  product: ProductWrite;
  categoryLinks: { categoryId: string; isPrimary: boolean }[];
  attributes: AttributeRow[];
  tags: string[];
  variants: VariantWrite[];
};

/** Who is saving. `permissions` decides whether status changes that need product:publish are allowed. */
export type Actor = { id: string; permissions: readonly string[] };
