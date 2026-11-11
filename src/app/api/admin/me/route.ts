import { requirePermission } from "@/core/permissions/require";
import { PERMISSIONS } from "@/core/permissions/keys";
import { errorResponse } from "@/core/errors/http";

/** Small protected endpoint: 401 when signed out, 403 without dashboard:view, otherwise the session user. */
export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.dashboardView);
    const { id, email, roles, permissions } = session.user;
    return Response.json({ id, email, roles, permissions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
