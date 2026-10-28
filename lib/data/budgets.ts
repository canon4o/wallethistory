import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { budgets, categories, recurringRules, transactions } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { cached } from "@/lib/cache";
import { requireHouseholdScope, type HouseholdScope } from "./household";
import { elapsedPercent, projectedCents } from "@/lib/budget-pace";
import { plannedCents, type PlannedRule } from "@/lib/budget-planned";
import { monthRange, periodRange, todayISO, type BudgetPeriod, type DateRange } from "@/lib/budget-period";
import { completeMonths, forecastLine, forecastRange, MIN_HISTORY_MONTHS, type Trend } from "@/lib/reports/forecast";
import { fromCents, toCents } from "@/lib/reports/money";
import { previousRange } from "@/lib/reports/periods";

/** How many past periods the history of a budget shows. */
export const BUDGET_HISTORY_PERIODS = 6;

export type BudgetPeriodSpend = { range: DateRange; spent: string };

export type BudgetItem = {
  id: string;
  period: BudgetPeriod;
  /** The limit, numeric(14,2) as text. */
  amount: string;
  category: { id: string; name: string; color: string; icon: string };
  /** The current week or month. */
  range: DateRange;
  /** Expenses of this category inside `range`, as text ("0.00" when none). */
  spent: string;
  /** amount - spent as text; negative when over budget. */
  remaining: string;
  /** How much of the period has passed, as a whole percent. */
  elapsedPercent: number;
  /** The spending at the end of the period at the pace so far, as text; null while nothing is spent. */
  projected: string | null;
  /** Active recurring expenses of this category that are still to come in `range`, as text ("0.00" when none). */
  planned: string;
  /** Spending in each of the last complete periods, oldest first. */
  history: BudgetPeriodSpend[];
  /** Expenses of this category in the period before `range` (last week or last month). */
  lastSpent: string;
  /**
   * The projected spending for one period (a week or a month), from the average of the last 6
   * complete months and their trend (the same maths as the forecast report); null without at
   * least two months of history.
   */
  forecast: string | null;
  /** How the category's spending is moving (recent months against earlier ones); null when there is no forecast. */
  trend: Trend | null;
};

/**
 * The user's budgets with how much was spent in each one's current period.
 * `today` is a parameter so the period windows can be tested; it defaults to today in the user's timezone.
 * Over-budget entries come first, then by how much of the limit is used.
 */
export async function listBudgets(today?: string): Promise<BudgetItem[]> {
  const user = await requireUser();
  const scope = await requireHouseholdScope();
  const rows = await queryBudgets(scope, [user.id], today ?? todayISO(user.timezone));
  return rows.map((row) => row.item);
}

export type SharedBudget = BudgetItem & { ownerId: string; ownerName: string };

/**
 * Budgets of the other people in the user's household, read-only. A budget counts only its
 * owner's spending (budgets stay personal).
 */
export async function listHouseholdBudgets(today?: string): Promise<SharedBudget[]> {
  const user = await requireUser();
  const scope = await requireHouseholdScope();
  const others = scope.memberIds.filter((id) => id !== scope.userId);
  if (others.length === 0) return [];
  const rows = await queryBudgets(scope, others, today ?? todayISO(user.timezone));
  return rows.map((row) => ({ ...row.item, ownerId: row.ownerId, ownerName: scope.names.get(row.ownerId) ?? "Member" }));
}

async function queryBudgets(
  scope: HouseholdScope,
  userIds: string[],
  today: string,
): Promise<Array<{ ownerId: string; item: BudgetItem }>> {
  const week = periodRange("weekly", today);
  const month = periodRange("monthly", today);

  const spent = sql<string>`coalesce((
    select sum(${transactions.amount})
    from ${transactions}
    where ${transactions.userId} = ${budgets.userId}
      and ${transactions.categoryId} = ${budgets.categoryId}
      and ${transactions.type} = 'expense'
      and ${transactions.date} >= (case ${budgets.period} when 'weekly' then ${week.start}::date else ${month.start}::date end)
      and ${transactions.date} <= (case ${budgets.period} when 'weekly' then ${week.end}::date else ${month.end}::date end)
  ), 0)`;

  const lastWeek = previousRange(week);
  const lastMonth = previousRange(month);
  const lastSpent = sql<string>`coalesce((
    select sum(${transactions.amount})
    from ${transactions}
    where ${transactions.userId} = ${budgets.userId}
      and ${transactions.categoryId} = ${budgets.categoryId}
      and ${transactions.type} = 'expense'
      and ${transactions.date} >= (case ${budgets.period} when 'weekly' then ${lastWeek.start}::date else ${lastMonth.start}::date end)
      and ${transactions.date} <= (case ${budgets.period} when 'weekly' then ${lastWeek.end}::date else ${lastMonth.end}::date end)
  ), 0)`;

  // Only the database read is cached; `today` is part of the key so a new day or week never reuses it.
  const rows = await cached({ name: "budgets", memberIds: scope.memberIds, args: { userIds, today } }, () =>
    getDb()
    .select({
      id: budgets.id,
      ownerId: budgets.userId,
      period: budgets.period,
      amount: budgets.amount,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      spent: sql<string>`(${spent})::numeric(14,2)::text`,
      remaining: sql<string>`(${budgets.amount} - ${spent})::numeric(14,2)::text`,
      lastSpent: sql<string>`(${lastSpent})::numeric(14,2)::text`,
    })
    .from(budgets)
    .innerJoin(categories, and(eq(categories.id, budgets.categoryId), eq(categories.userId, budgets.userId)))
    .where(inArray(budgets.userId, userIds)),
  );

  const history = await spendingHistory(scope, userIds, today);
  const periodHistory = await periodSpendHistory(scope, userIds, week, month);
  const plannedRules = await activeExpenseRules(userIds);

  const items = rows.map((row) => ({
    ownerId: row.ownerId,
    item: {
      id: row.id,
      period: row.period,
      amount: row.amount,
      category: {
        id: row.categoryId,
        name: row.categoryName,
        color: row.categoryColor,
        icon: row.categoryIcon,
      },
      range: row.period === "weekly" ? week : month,
      elapsedPercent: elapsedPercent(row.period === "weekly" ? week : month, today),
      projected: projectedFor(row.spent, row.period === "weekly" ? week : month, today),
      planned: fromCents(plannedCents(plannedRules.get(`${row.ownerId}:${row.categoryId}`) ?? [], row.period === "weekly" ? week : month, today)),
      history: periodHistory(row.ownerId, row.categoryId, row.period),
      spent: row.spent,
      remaining: row.remaining,
      lastSpent: row.lastSpent,
      ...forecastFields(history, row.ownerId, row.categoryId, row.period),
    },
  }));

  const usage = (item: BudgetItem) => Number(item.spent) / Number(item.amount);
  return items.sort(
    (x, y) =>
      usage(y.item) - usage(x.item) ||
      x.item.category.name.localeCompare(y.item.category.name) ||
      x.item.period.localeCompare(y.item.period),
  );
}

/** Each person's active recurring expense rules by `userId:categoryId`. */
async function activeExpenseRules(userIds: string[]): Promise<Map<string, PlannedRule[]>> {
  const rows = await getDb()
    .select({
      userId: recurringRules.userId,
      categoryId: recurringRules.categoryId,
      amount: recurringRules.amount,
      frequency: recurringRules.frequency,
      intervalCount: recurringRules.intervalCount,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
      nextDueDate: recurringRules.nextDueDate,
    })
    .from(recurringRules)
    .where(and(inArray(recurringRules.userId, userIds), eq(recurringRules.kind, "expense"), eq(recurringRules.status, "active")));
  const result = new Map<string, PlannedRule[]>();
  for (const row of rows) {
    if (!row.categoryId) continue;
    const key = `${row.userId}:${row.categoryId}`;
    result.set(key, [
      ...(result.get(key) ?? []),
      { ...row, amountCents: toCents(row.amount) },
    ]);
  }
  return result;
}

/** The `BUDGET_HISTORY_PERIODS` complete periods before `current`, oldest first. */
function pastPeriods(current: DateRange): DateRange[] {
  const periods: DateRange[] = [];
  let range = current;
  for (let i = 0; i < BUDGET_HISTORY_PERIODS; i++) {
    range = previousRange(range);
    periods.unshift(range);
  }
  return periods;
}

/**
 * Spending per user, category and week or month over the last complete periods; returns a lookup
 * that gives a budget its periods oldest first, with "0.00" for periods without spending.
 */
async function periodSpendHistory(
  scope: HouseholdScope,
  userIds: string[],
  week: DateRange,
  month: DateRange,
): Promise<(userId: string, categoryId: string, period: BudgetPeriod) => BudgetPeriodSpend[]> {
  const periods = { weekly: pastPeriods(week), monthly: pastPeriods(month) };
  const span = (list: DateRange[]) => ({ start: list[0].start, end: list[list.length - 1].end });
  const load = (period: BudgetPeriod) => {
    const { start, end } = span(periods[period]);
    const bucket = sql<string>`to_char(date_trunc(${sql.raw(period === "weekly" ? "'week'" : "'month'")}, ${transactions.date}), 'YYYY-MM-DD')`;
    return cached({ name: "budgetPeriodHistory", memberIds: scope.memberIds, args: { userIds, period, start, end } }, () =>
      getDb()
        .select({
          userId: transactions.userId,
          categoryId: transactions.categoryId,
          bucket,
          amount: sql<string>`sum(${transactions.amount})::numeric(14,2)::text`,
        })
        .from(transactions)
        .where(
          and(
            inArray(transactions.userId, userIds),
            eq(transactions.type, "expense"),
            gte(transactions.date, start),
            lte(transactions.date, end),
          ),
        )
        .groupBy(transactions.userId, transactions.categoryId, bucket),
    );
  };
  const [weekly, monthly] = await Promise.all([load("weekly"), load("monthly")]);
  const spent = new Map<string, string>();
  for (const [period, rows] of [["weekly", weekly], ["monthly", monthly]] as const) {
    for (const row of rows) spent.set(`${period}:${row.userId}:${row.categoryId}:${row.bucket}`, row.amount);
  }
  return (userId, categoryId, period) =>
    periods[period].map((range) => ({
      range,
      spent: spent.get(`${period}:${userId}:${categoryId}:${range.start}`) ?? "0.00",
    }));
}

/** Each person's monthly spending per category over the last 6 complete months, from their first expense on. */
type SpendingHistory = Map<string, { months: number; byCategory: Map<string, number[]> }>;

async function spendingHistory(scope: HouseholdScope, userIds: string[], today: string): Promise<SpendingHistory> {
  const result: SpendingHistory = new Map();
  const complete = completeMonths(forecastRange(today), today);
  if (complete.length === 0) return result;
  const span = { start: complete[0], end: monthRange(complete[complete.length - 1]).end };
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM-01')`;

  const rows = await cached({ name: "budgetHistory", memberIds: scope.memberIds, args: { userIds, span } }, () =>
    getDb()
      .select({
        userId: transactions.userId,
        categoryId: transactions.categoryId,
        month,
        amount: sql<string>`sum(${transactions.amount})::numeric(14,2)::text`,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, userIds),
          eq(transactions.type, "expense"),
          gte(transactions.date, span.start),
          lte(transactions.date, span.end),
        ),
      )
      .groupBy(transactions.userId, transactions.categoryId, month),
  );

  for (const userId of userIds) {
    const own = rows.filter((row) => row.userId === userId);
    if (own.length === 0) continue;
    // Months before the person's first expense are not history, as in the forecast report.
    const first = own.reduce((min, row) => (row.month < min ? row.month : min), own[0].month);
    const history = complete.filter((start) => start >= first);
    const byCategory = new Map<string, number[]>();
    for (const row of own) {
      if (!row.categoryId) continue;
      const cents = byCategory.get(row.categoryId) ?? history.map(() => 0);
      cents[history.indexOf(row.month)] += toCents(row.amount);
      byCategory.set(row.categoryId, cents);
    }
    result.set(userId, { months: history.length, byCategory });
  }
  return result;
}

/**
 * The projected spending for one budget period and the category's trend, or null without two
 * months of history. A week is 12/52 of a month. A category without spending in those months is
 * projected at zero.
 */
function projectionFor(
  history: SpendingHistory,
  userId: string,
  categoryId: string,
  period: BudgetPeriod,
): { forecast: string; trend: Trend } | null {
  const own = history.get(userId);
  if (!own || own.months < MIN_HISTORY_MONTHS) return null;
  const cents = own.byCategory.get(categoryId) ?? new Array<number>(own.months).fill(0);
  const line = forecastLine({ key: null, name: "", color: "", icon: null, cents });
  const monthly = line.forecastCents;
  return {
    forecast: fromCents(period === "weekly" ? Math.round((monthly * 12) / 52) : monthly),
    trend: line.trend.direction,
  };
}

/** What the budget form shows under the limit, for one period. */
export type BudgetPeriodHint = { lastSpent: string; forecast: string | null; trend: Trend | null };
export type BudgetHint = { weekly: BudgetPeriodHint; monthly: BudgetPeriodHint };

/**
 * For every expense category of the user, last week's and last month's spending and the projection
 * for a week and a month, to help choose a limit (the category may not have a budget yet).
 */
export async function getBudgetHints(today?: string): Promise<Record<string, BudgetHint>> {
  const user = await requireUser();
  const scope = await requireHouseholdScope();
  const day = today ?? todayISO(user.timezone);
  const lastWeek = previousRange(periodRange("weekly", day));
  const lastMonth = previousRange(periodRange("monthly", day));
  const inRange = (range: DateRange) =>
    sql`coalesce(sum(${transactions.amount}) filter (where ${transactions.date} >= ${range.start}::date and ${transactions.date} <= ${range.end}::date), 0)::numeric(14,2)::text`;

  const [categoryRows, spentRows, history] = await Promise.all([
    getDb()
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, user.id), eq(categories.type, "expense"))),
    cached({ name: "budgetHintSpent", memberIds: scope.memberIds, args: { userId: user.id, lastWeek, lastMonth } }, () =>
      getDb()
        .select({ categoryId: transactions.categoryId, week: inRange(lastWeek) as SQL<string>, month: inRange(lastMonth) as SQL<string> })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, user.id),
            eq(transactions.type, "expense"),
            gte(transactions.date, lastMonth.start < lastWeek.start ? lastMonth.start : lastWeek.start),
            lte(transactions.date, lastMonth.end > lastWeek.end ? lastMonth.end : lastWeek.end),
          ),
        )
        .groupBy(transactions.categoryId),
    ),
    spendingHistory(scope, [user.id], day),
  ]);

  const spent = new Map(spentRows.map((row) => [row.categoryId, row]));
  const hint = (id: string, period: BudgetPeriod): BudgetPeriodHint => {
    const row = spent.get(id);
    const projection = projectionFor(history, user.id, id, period);
    return {
      lastSpent: (period === "weekly" ? row?.week : row?.month) ?? "0.00",
      forecast: projection?.forecast ?? null,
      trend: projection?.trend ?? null,
    };
  };
  return Object.fromEntries(categoryRows.map(({ id }) => [id, { weekly: hint(id, "weekly"), monthly: hint(id, "monthly") }]));
}

function projectedFor(spent: string, range: DateRange, today: string): string | null {
  const cents = projectedCents(toCents(spent), range, today);
  return cents === null ? null : fromCents(cents);
}

function forecastFields(history: SpendingHistory, userId: string, categoryId: string, period: BudgetPeriod) {
  const projection = projectionFor(history, userId, categoryId, period);
  return { forecast: projection?.forecast ?? null, trend: projection?.trend ?? null };
}
