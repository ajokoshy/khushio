import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import { cloudinaryConfigured, publicCloudName } from "@/infrastructure/cloudinary";
import { ARTICLE_TYPES, ARTICLE_TYPE_LABELS, CONTENT_STATUSES, CONTENT_STATUS_LABELS } from "@/modules/content/types";

export const CONTENT_STATUS_OPTIONS = CONTENT_STATUSES.map((s) => ({ value: s as string, label: CONTENT_STATUS_LABELS[s], publishControlled: s === "SCHEDULED" || s === "PUBLISHED" || s === "ARCHIVED" }));

export const ARTICLE_TYPE_OPTIONS = ARTICLE_TYPES.map((t) => ({ value: t as string, label: ARTICLE_TYPE_LABELS[t] }));

/** What the editor screens need to know about the person and the environment. */
export function editorSetup(permissions: readonly string[]) {
  return {
    canPublish: hasPermission(permissions, P.contentPublish),
    canEditSeo: hasPermission(permissions, P.seoWrite),
    cloudName: publicCloudName(),
    uploadsEnabled: cloudinaryConfigured(),
  };
}
