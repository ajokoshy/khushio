import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { templateFor } from "@/modules/imports/service";
import { isImportEntity } from "@/modules/imports/types";

export const dynamic = "force-dynamic";

/** The CSV template of one kind of import: the header line and one example row. */
export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requirePermission(P.importRun);
  } catch (error) {
    if (error instanceof UnauthorizedError) return new NextResponse("Sign in first.", { status: 401, headers: { "Cache-Control": "no-store" } });
    if (error instanceof ForbiddenError) return new NextResponse("You do not have permission.", { status: 403, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
  const { entity } = await params;
  if (!isImportEntity(entity)) return new NextResponse("Unknown template.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(templateFor(entity), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="khushio-${entity}-template.csv"`, "Cache-Control": "no-store" },
  });
}
