import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { exportCsv, isExportName } from "@/modules/imports/service";
import { parseRange } from "@/modules/reports/days";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** CSV download of products, links, deals, brands or click counts. Needs the import/export permission; never cached. */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  let actorId: string;
  try {
    actorId = (await requirePermission(P.importRun)).user.id;
  } catch (error) {
    if (error instanceof UnauthorizedError) return new NextResponse("Sign in first.", { status: 401, headers: NO_STORE });
    if (error instanceof ForbiddenError) return new NextResponse("You do not have permission.", { status: 403, headers: NO_STORE });
    throw error;
  }
  const { name } = await params;
  if (!isExportName(name)) return new NextResponse("Unknown export.", { status: 404, headers: NO_STORE });
  const range = parseRange(new URL(req.url).searchParams.get("range") ?? undefined);
  const file = await exportCsv(name, { range, actorId });
  return new NextResponse(file.csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"`, "X-Export-Rows": String(file.rows), "X-Export-Truncated": file.truncated ? "yes" : "no", ...NO_STORE },
  });
}
