import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetAlertDismissals } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { alertLevel, usedPercent, type BudgetAlertLevel } from "@/lib/budget-alerts";
import type { BudgetPeriod } from "@/lib/budget-period";
import { toCents } from "@/lib/reports/money";
import { listBudgets, type BudgetItem } from "./budgets";

export type BudgetAlert = {
  budgetId: string;
  level: BudgetAlertLevel;
  period: BudgetPeriod;
  category: { name: string; icon: string; color: string };
  /** numeric(14,2) as text, like the budget it comes from. */
  spent: string;
  amount: string;
  /** Share of the limit used, a whole number rounded down. */
  percent: number;
  /** First day of the budget's current period; dismissing an alert is keyed by it. */
  periodStart: string;
};

/** Every budget of the user that is at warning or exceeded level, whether or not its alert was dismissed. */
function leveledBudgets(budgets: BudgetItem[], thresholdPercent: number): Array<{ budget: BudgetItem; level: BudgetAlertLevel; percent: number }> {
  return budgets.flatMap((budget) => {
    const spentCents = toCents(budget.spent);
    const amountCents = toCents(budget.amount);
    const level = alertLevel(spentCents, amountCents, thresholdPercent);
    return level ? [{ budget, level, percent: usedPercent(spentCents, amountCents) }] : [];
  });
}

const dismissalKey = (budgetId: string, periodStart: string, level: BudgetAlertLevel) =>
  `${budgetId}|${periodStart}|${level}`;

/**
 * The user's own budgets that are close to or over their limit in the current period, minus the
 * alerts they dismissed for this period. Computed on every read, never stored, so expenses from
 * recurring rules, edits and deletes are all covered. Exceeded alerts come first, then by percent.
 * `today` is a parameter so period windows can be tested.
 */
export async function listBudgetAlerts(today?: string): Promise<BudgetAlert[]> {
  const user = await requireUser();
  if (!user.budgetAlertsEnabled) return [];

  const candidates: BudgetAlert[] = leveledBudgets(await listBudgets(today), user.budgetAlertThreshold).map(
    ({ budget, level, percent }) => ({
      budgetId: budget.id,
      level,
      period: budget.period,
      category: { name: budget.category.name, icon: budget.category.icon, color: budget.category.color },
      spent: budget.spent,
      amount: budget.amount,
      percent,
      periodStart: budget.range.start,
    }),
  );
  if (candidates.length === 0) return [];

  // Not cached: a dismissal must hide the alert on the very next read.
  const dismissed = await getDb()
    .select({ budgetId: budgetAlertDismissals.budgetId, periodStart: budgetAlertDismissals.periodStart, level: budgetAlertDismissals.level })
    .from(budgetAlertDismissals)
    .where(and(eq(budgetAlertDismissals.userId, user.id), inArray(budgetAlertDismissals.budgetId, candidates.map((alert) => alert.budgetId))));
  const hidden = new Set(dismissed.map((row) => dismissalKey(row.budgetId, row.periodStart, row.level)));

  return candidates
    .filter((alert) => !hidden.has(dismissalKey(alert.budgetId, alert.periodStart, alert.level)))
    .sort(
      (x, y) =>
        Number(y.level === "exceeded") - Number(x.level === "exceeded") ||
        y.percent - x.percent ||
        x.category.name.localeCompare(y.category.name) ||
        x.period.localeCompare(y.period),
    );
}
