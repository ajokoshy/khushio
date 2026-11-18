"use server";

import { redirect } from "next/navigation";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/content/service";
import { categoryInputSchema, idSchema, tagInputSchema } from "@/modules/content/validation";

async function run(work: (actorId: string) => Promise<void>, notice: string): Promise<void> {
  let target = `/admin/topics?notice=${notice}`;
  try {
    const session = await requirePermission(P.contentWrite);
    await work(session.user.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) target = "/admin-login";
    else if (error instanceof ValidationError || error instanceof ConflictError) target = "/admin/topics?notice=invalid";
    else {
      if (!(error instanceof ForbiddenError) && !(error instanceof NotFoundError)) console.error("Topic action failed", error);
      target = "/admin/topics?notice=failed";
    }
  }
  redirect(target);
}

const invalid = () => new ValidationError("Invalid", {});

export async function createTopicAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const parsed = categoryInputSchema.safeParse({ ...formDataToObject(formData), isActive: "on" });
    if (!parsed.success) throw invalid();
    await service.createCategory(parsed.data, actor);
  }, "created");
}
export async function updateTopicAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const id = idSchema.safeParse(formData.get("id"));
    const parsed = categoryInputSchema.safeParse(formDataToObject(formData));
    if (!id.success || !parsed.success) throw invalid();
    await service.updateCategory(id.data, parsed.data, actor);
  }, "updated");
}
export async function deleteTopicAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const id = idSchema.safeParse(formData.get("id"));
    if (!id.success) throw invalid();
    await service.deleteCategory(id.data, actor);
  }, "deleted");
}
export async function createTagAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const parsed = tagInputSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) throw invalid();
    await service.createTag(parsed.data, actor);
  }, "created");
}
export async function renameTagAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const id = idSchema.safeParse(formData.get("id"));
    const parsed = tagInputSchema.safeParse(formDataToObject(formData));
    if (!id.success || !parsed.success) throw invalid();
    await service.renameTag(id.data, parsed.data, actor);
  }, "updated");
}
export async function deleteTagAction(formData: FormData): Promise<void> {
  await run(async (actor) => {
    const id = idSchema.safeParse(formData.get("id"));
    if (!id.success) throw invalid();
    await service.deleteTag(id.data, actor);
  }, "deleted");
}
