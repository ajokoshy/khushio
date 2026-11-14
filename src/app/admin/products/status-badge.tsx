import { formatAdminDateTime } from "@/core/validation/datetime";
import { STATUS_LABELS, type ProductStatus } from "@/modules/products/types";

const tone: Record<ProductStatus, string> = {
  DRAFT: "bg-cream-200 text-ink-600",
  REVIEW: "bg-cream-200 text-forest-800",
  SCHEDULED: "bg-forest-100 text-forest-800",
  PUBLISHED: "bg-forest-800 text-cream-50",
  ARCHIVED: "bg-coral-100 text-coral-600",
  DISCONTINUED: "bg-coral-100 text-coral-600",
};

export function ProductStatusBadge({ status, publishAt }: { status: ProductStatus; publishAt?: Date | null }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${tone[status]}`}>
      {STATUS_LABELS[status]}
      {status === "SCHEDULED" && publishAt ? `: ${formatAdminDateTime(publishAt)}` : ""}
    </span>
  );
}
