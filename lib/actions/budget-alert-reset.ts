import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetAlertDismissals, budgets } from "@/db/schema";

// Not a "use server" file: these helpers are called by other actions, never from the client.

type Db = Pick<ReturnType<typeof getDb>, "delete">;

/**
 * Forgets the dismissed alerts of one budget. Called when its limit is edited: the old
 * dismissals were about a different limit, so the alert may show again at the new one.
 */
export async function clearDismissalsForBudget(userId: string, budgetId: string, db: Db = getDb()): Promise<void> {
  await db
    .delete(budgetAlertDismissals)
    .where(and(eq(budgetAlertDismissals.userId, userId), eq(budgetAlertDismissals.budgetId, budgetId)));
}

export type SpendingChange = { categoryId: string | null | undefined; date: string };

/**
 * Forgets the dismissed alerts of the user's budgets whose current-at-the-time period contains a
 * changed expense: same category, and the dismissal's `period_start` is the start of the week or
 * month of the expense's date. Called when an expense is updated or deleted, with its old and new
 * category and date. Dismissals of other periods (an old month, or a later one) are kept.
 */
export async function clearDismissalsForSpendingChanges(
  userId: string,
  changes: SpendingChange[],
  db: Db = getDb(),
): Promise<void> {
  const seen = new Set<string>();
  for (const { categoryId, date } of changes) {
    if (!categoryId || seen.has(`${categoryId}|${date}`)) continue;
    seen.add(`${categoryId}|${date}`);
    await db.delete(budgetAlertDismissals).where(
      and(
        eq(budgetAlertDismissals.userId, userId),
        inArray(
          budgetAlertDismissals.budgetId,
          getDb()
            .select({ id: budgets.id })
            .from(budgets)
            .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId))),
        ),
        // Postgres weeks start on Monday, like periodRange().
        sql`${budgetAlertDismissals.periodStart} = (case (select b.period from budgets b where b.id = ${budgetAlertDismissals.budgetId})
          when 'weekly' then date_trunc('week', ${date}::date) else date_trunc('month', ${date}::date) end)::date`,
      ),
    );
  }
}
