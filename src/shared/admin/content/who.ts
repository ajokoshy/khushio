import type { Session } from "next-auth";
import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import type { Who } from "@/modules/content/service";

/** What the signed-in person may do with content, for the content service (not a server action). */
export function whoOf(session: Session): Who {
  const permissions = session.user.permissions;
  return { actorId: session.user.id, canPublish: hasPermission(permissions, P.contentPublish), canEditSeo: hasPermission(permissions, P.seoWrite) };
}
