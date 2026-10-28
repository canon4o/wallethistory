"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { tagSchema } from "@/lib/validation/tags";
import {
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

const DUPLICATE: ActionFailure = {
  ok: false,
  error: msg("A tag with this name already exists."),
  fieldErrors: { name: [msg("A tag with this name already exists.")] },
};

/** Tags are shown on transactions too. */
async function revalidate() {
  for (const path of ["/profile/tags", "/transactions"]) await revalidatePath(path);
}

export async function createTag(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    try {
      await getDb().insert(tags).values({ ...parsed.data, userId: user.id });
    } catch (error) {
      if (isUniqueViolation(error)) return DUPLICATE;
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}

export async function updateTag(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    try {
      const updated = await getDb()
        .update(tags)
        .set(parsed.data)
        .where(and(eq(tags.id, parsedId.data), eq(tags.userId, user.id)))
        .returning({ id: tags.id });
      if (updated.length === 0) return notFoundFailure();
    } catch (error) {
      if (isUniqueViolation(error)) return DUPLICATE;
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}

/** Deleting a tag removes it from transactions (cascade); the transactions themselves stay. */
export async function deleteTag(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const deleted = await getDb()
      .delete(tags)
      .where(and(eq(tags.id, parsedId.data), eq(tags.userId, user.id)))
      .returning({ id: tags.id });
    if (deleted.length === 0) return notFoundFailure();
    await revalidate();
    return { ok: true };
  });
}
