"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetAlertDismissals, budgets, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { periodRange, todayISO } from "@/lib/budget-period";
import { budgetAlertSettingsSchema, dismissBudgetAlertSchema } from "@/lib/validation/budget-alerts";
import { failure, guarded, notFoundFailure, validationFailure, type ActionResult } from "./result";
import { msg } from "@/lib/i18n/translate";

/**
 * Hides one alert (a budget at one level) for the rest of its current period. Stored in the
 * database so it follows the user across devices; a new week or month starts with a new
 * `periodStart`, so the alert can show again.
 */
export async function dismissBudgetAlert(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = dismissBudgetAlertSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    const [budget] = await getDb()
      .select({ period: budgets.period })
      .from(budgets)
      .where(and(eq(budgets.id, parsed.data.budgetId), eq(budgets.userId, user.id)));
    if (!budget) return notFoundFailure();

    // Only the budget's current period can be dismissed, so old or made-up dates never pile up.
    if (parsed.data.periodStart !== periodRange(budget.period, todayISO(user.timezone)).start) {
      return failure(msg("This alert is out of date."));
    }

    await getDb()
      .insert(budgetAlertDismissals)
      .values({ userId: user.id, budgetId: parsed.data.budgetId, periodStart: parsed.data.periodStart, level: parsed.data.level })
      .onConflictDoNothing();
    // The alert strip lives in the layout of every page.
    await revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Turns in-app budget alerts on or off and sets the percent of a budget that triggers a warning. */
export async function updateBudgetAlertSettings(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = budgetAlertSettingsSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  return guarded(async () => {
    await getDb()
      .update(users)
      .set({ budgetAlertsEnabled: parsed.data.enabled, budgetAlertThreshold: parsed.data.threshold })
      .where(eq(users.id, user.id));
    await revalidatePath("/", "layout");
    return { ok: true };
  });
}
