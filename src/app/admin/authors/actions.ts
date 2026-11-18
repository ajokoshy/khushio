"use server";

import { redirect } from "next/navigation";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/content/service";
import { authorInputSchema, idSchema } from "@/modules/content/validation";

/** Plain form buttons that always redirect back to the list with a notice code, so they work without JavaScript. */
async function run(work: (actorId: string) => Promise<void>, notice: string): Promise<void> {
  let target = `/admin/authors?notice=${notice}`;
  try {
    const session = await requirePermission(P.contentWrite);
    await work(session.user.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) target = "/admin-login";
    else if (error instanceof ValidationError || error instanceof ConflictError) target = "/admin/authors?notice=invalid";
    else {
      if (!(error instanceof ForbiddenError) && !(error instanceof NotFoundError)) console.error("Author action failed", error);
      target = "/admin/authors?notice=failed";
    }
  }
  redirect(target);
}

export async function createAuthorAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const parsed = authorInputSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) throw new ValidationError("Invalid", {});
    await service.createAuthor(parsed.data, actor);
  }, "created");
}

export async function updateAuthorAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const id = idSchema.safeParse(formData.get("id"));
    const parsed = authorInputSchema.safeParse(formDataToObject(formData));
    if (!id.success || !parsed.success) throw new ValidationError("Invalid", {});
    await service.updateAuthor(id.data, parsed.data, actor);
  }, "updated");
}

export async function deleteAuthorAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const id = idSchema.safeParse(formData.get("id"));
    if (!id.success) throw new ValidationError("Invalid", {});
    await service.deleteAuthor(id.data, actor);
  }, "deleted");
}
