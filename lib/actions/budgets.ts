"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { budgets, categories } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { clearDismissalsForBudget } from "./budget-alert-reset";
import { idSchema } from "@/lib/validation/common";
import { budgetSchema, type BudgetInput } from "@/lib/validation/budgets";
import {
  fieldFailure,
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

async function revalidate() {
  for (const path of ["/budgets", "/dashboard"]) await revalidatePath(path);
}

/** The category must be one of the user's own expense categories (budgets track expenses only). */
async function verifyCategory(userId: string, categoryId: string): Promise<ActionFailure | null> {
  const [category] = await getDb()
    .select({ type: categories.type })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  if (!category) return fieldFailure("categoryId", msg("Choose one of your categories"));
  if (category.type !== "expense") {
    return fieldFailure("categoryId", msg("Budgets work with expense categories only"));
  }
  return null;
}

function duplicate(period: BudgetInput["period"]): Promise<ActionFailure> {
  return fieldFailure(
    "categoryId",
    period === "weekly" ? msg("A weekly budget for this category already exists") : msg("A monthly budget for this category already exists"),
  );
}

export async function createBudget(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const invalid = await verifyCategory(user.id, parsed.data.categoryId);
    if (invalid) return invalid;
    try {
      await getDb().insert(budgets).values({ ...parsed.data, userId: user.id });
    } catch (error) {
      if (isUniqueViolation(error)) return duplicate(parsed.data.period);
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}

export async function updateBudget(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const invalid = await verifyCategory(user.id, parsed.data.categoryId);
    if (invalid) return invalid;
    try {
      const updated = await getDb()
        .update(budgets)
        .set(parsed.data)
        .where(and(eq(budgets.id, parsedId.data), eq(budgets.userId, user.id)))
        .returning({ id: budgets.id });
      if (updated.length === 0) return notFoundFailure();
      // The dismissals were about the old limit; the alert may show again at the new one.
      await clearDismissalsForBudget(user.id, parsedId.data);
    } catch (error) {
      if (isUniqueViolation(error)) return duplicate(parsed.data.period);
      throw error;
    }
    await revalidate();
    return { ok: true };
  });
}

export async function deleteBudget(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure();

  return guarded(async () => {
    const deleted = await getDb()
      .delete(budgets)
      .where(and(eq(budgets.id, parsedId.data), eq(budgets.userId, user.id)))
      .returning({ id: budgets.id });
    if (deleted.length === 0) return notFoundFailure();
    await revalidate();
    return { ok: true };
  });
}
