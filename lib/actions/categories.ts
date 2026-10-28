"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { isForeignKeyViolation, isUniqueViolation } from "@/db/errors";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { createCategorySchema, updateCategorySchema } from "@/lib/validation/categories";
import {
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

const IN_USE_ERROR =
  msg("This category is used by transactions. Delete or recategorize them before deleting the category.");

const DUPLICATE: ActionFailure = {
  ok: false,
  error: msg("A category with this name already exists for this type."),
  fieldErrors: { name: [msg("A category with this name already exists for this type.")] },
};

/** Categories are shown on transactions, budgets and the dashboard too. */
async function revalidate() {
  for (const path of ["/profile/categories", "/transactions", "/budgets", "/dashboard"]) {
    await revalidatePath(path);
  }
}

export async function createCategory(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    try {
      await getDb().insert(categories).values({ ...parsed.data, userId: user.id });
    } catch (error) {
      if (isUniqueViolation(error)) return DUPLICATE;
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}

/** The type cannot be changed: it is not accepted here and the database refuses it as well. */
export async function updateCategory(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    try {
      const updated = await getDb()
        .update(categories)
        .set(parsed.data)
        .where(and(eq(categories.id, parsedId.data), eq(categories.userId, user.id)))
        .returning({ id: categories.id });
      if (updated.length === 0) return notFoundFailure();
    } catch (error) {
      if (isUniqueViolation(error)) return DUPLICATE;
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}

export async function deleteCategory(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    try {
      const deleted = await getDb()
        .delete(categories)
        .where(and(eq(categories.id, parsedId.data), eq(categories.userId, user.id)))
        .returning({ id: categories.id });
      if (deleted.length === 0) return notFoundFailure();
    } catch (error) {
      if (isForeignKeyViolation(error)) return { ok: false, error: IN_USE_ERROR };
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}
