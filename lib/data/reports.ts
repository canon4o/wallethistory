import { and, asc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { getT } from "@/lib/i18n/server";
import { cached } from "@/lib/cache";
import { getDb } from "@/db";
import { accounts, categories, tags, transactionTags, transactions } from "@/db/schema";
import { monthRange, type DateRange } from "@/lib/budget-period";
import { UNCATEGORIZED_COLOR } from "@/lib/reports/constants";
import { changeRatio, fromCents, savingsRate, toCents } from "@/lib/reports/money";
import {
  completeMonths,
  forecastLine,
  FORECAST_MONTHS,
  MIN_HISTORY_MONTHS,
  trendOf,
  yearEndCents,
  type Trend,
} from "@/lib/reports/forecast";
import { addMonths, monthStarts, previousRange } from "@/lib/reports/periods";
import type { Comparison, ReportFilters, ReportType } from "@/lib/validation/reports";
import { listAccounts, listHouseholdAccounts } from "./accounts";
import { listFilterCategories } from "./categories";
import { getHouseholdOverview, requireHouseholdScope, type HouseholdScope } from "./household";
import { listFilterTags } from "./tags";
import { escapeLike, parseCategoryKey } from "./transactions";

// Money is summed in SQL as numeric and comes back as text. Adding totals across rows happens in
// whole cents (lib/reports/money.ts), so nothing here goes through floating point.
// Transfers are not income or expense, so they appear in the balance report only.

/** Whose transactions a report covers: the chosen person if they are in the household, else everyone. */
function readableUserIds(scope: HouseholdScope, filters: ReportFilters): string[] {
  return filters.personId && scope.memberIds.includes(filters.personId) ? [filters.personId] : scope.memberIds;
}

/** The filters that narrow transactions (account, category, tag, note). Each report adds its own dates. */
function transactionConditions(userIds: string[], filters: ReportFilters): SQL[] {
  const conditions: SQL[] = [inArray(transactions.userId, userIds)];
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters.category) {
    const category = parseCategoryKey(filters.category);
    conditions.push(
      category
        ? sql`exists (select 1 from ${categories} where ${categories.id} = ${transactions.categoryId} and ${categories.type} = ${category.type} and lower(${categories.name}) = lower(${category.name}))`
        : sql`false`,
    );
  }
  if (filters.tag) {
    conditions.push(
      sql`exists (select 1 from ${transactionTags} inner join ${tags} on ${tags.id} = ${transactionTags.tagId} where ${transactionTags.transactionId} = ${transactions.id} and lower(${tags.name}) = lower(${filters.tag}))`,
    );
  }
  if (filters.q) conditions.push(ilike(transactions.note, `%${escapeLike(filters.q)}%`));
  return conditions;
}

function within(range: DateRange): SQL {
  return and(gte(transactions.date, range.start), lte(transactions.date, range.end))!;
}

/** Sum of one transaction type, optionally only inside a date range, as numeric text. */
function sumOf(type: ReportType, range?: DateRange): SQL<string> {
  const condition = range
    ? sql`${transactions.type} = ${type} and ${within(range)}`
    : sql`${transactions.type} = ${type}`;
  return sql<string>`coalesce(sum(${transactions.amount}) filter (where ${condition}), 0)::numeric(14,2)::text`;
}

// --- Cash flow ---

export type CashFlowMonth = {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  income: string;
  expense: string;
  net: string;
};

export type CashFlow = {
  months: CashFlowMonth[];
  income: string;
  expense: string;
  net: string;
  /** (income - expenses) / income, or null when nothing came in. */
  savingsRate: number | null;
  /** False when no transaction matches the filters in the period. */
  hasData: boolean;
};

/** Income and expenses for every month of the period, plus the period's totals. */
export async function getCashFlow(filters: ReportFilters): Promise<CashFlow> {
  const scope = await requireHouseholdScope();
  const userIds = readableUserIds(scope, filters);
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM-01')`;

  const rows = await cached(
    { name: "cashFlow", memberIds: scope.memberIds, args: { userIds, filters } },
    () =>
      getDb()
        .select({ month, income: sumOf("income"), expense: sumOf("expense") })
        .from(transactions)
        .where(and(...transactionConditions(userIds, filters), within(filters.range)))
        .groupBy(month),
  );

  const byMonth = new Map(rows.map((row) => [row.month, row]));
  let income = 0;
  let expense = 0;
  const months = monthStarts(filters.range).map((start) => {
    const row = byMonth.get(start);
    const monthIncome = toCents(row?.income ?? "0");
    const monthExpense = toCents(row?.expense ?? "0");
    income += monthIncome;
    expense += monthExpense;
    return {
      month: start,
      income: fromCents(monthIncome),
      expense: fromCents(monthExpense),
      net: fromCents(monthIncome - monthExpense),
    };
  });

  return {
    months,
    income: fromCents(income),
    expense: fromCents(expense),
    net: fromCents(income - expense),
    savingsRate: savingsRate(income, expense),
    hasData: rows.length > 0,
  };
}

// --- Totals per category ---

export type CategoryTotal = {
  /** `type:name`, to filter transactions by this category; null for transactions without one. */
  key: string | null;
  name: string;
  color: string;
  icon: string | null;
  /** The amount in the first (current) period and in the second (earlier) period. */
  a: string;
  b: string;
  /** Share of the first period's total, 0 to 1. */
  share: number;
  /** a - b. */
  delta: string;
  /** (a - b) / b, or null when b is zero. */
  change: number | null;
};

export type CategoryTotals = { rows: CategoryTotal[]; totalA: string; totalB: string };

/** Totals per category (matched by name across the household) for two periods. */
async function getCategoryTotals(
  filters: ReportFilters,
  type: ReportType,
  a: DateRange,
  b: DateRange,
): Promise<CategoryTotals> {
  const scope = await requireHouseholdScope();
  const t = await getT();
  const userIds = readableUserIds(scope, filters);
  const group = sql`lower(${categories.name})`;

  // Only the database rows are cached: the "Uncategorized" label below depends on the language.
  const rows = await cached(
    { name: "categoryTotals", memberIds: scope.memberIds, args: { userIds, filters, type, a, b } },
    () =>
      getDb()
        .select({
          name: sql<string | null>`min(${categories.name})`,
          color: sql<string | null>`min(${categories.color})`,
          icon: sql<string | null>`min(${categories.icon})`,
          a: sumOf(type, a),
          b: sumOf(type, b),
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(and(...transactionConditions(userIds, filters), eq(transactions.type, type), or(within(a), within(b))))
        .groupBy(group),
  );

  const totalA = rows.reduce((sum, row) => sum + toCents(row.a), 0);
  const totalB = rows.reduce((sum, row) => sum + toCents(row.b), 0);
  const items = rows
    .map((row): CategoryTotal => {
      const amountA = toCents(row.a);
      const amountB = toCents(row.b);
      return {
        key: row.name === null ? null : `${type}:${row.name}`,
        name: row.name ?? t("Uncategorized"),
        color: row.color ?? UNCATEGORIZED_COLOR,
        icon: row.icon,
        a: fromCents(amountA),
        b: fromCents(amountB),
        share: totalA > 0 ? amountA / totalA : 0,
        delta: fromCents(amountA - amountB),
        change: changeRatio(amountA, amountB),
      };
    })
    .sort((x, y) => toCents(y.a) - toCents(x.a) || toCents(y.b) - toCents(x.b) || x.name.localeCompare(y.name));

  return { rows: items, totalA: fromCents(totalA), totalB: fromCents(totalB) };
}

// --- Spending by category ---

export type SpendingByCategory = CategoryTotals & {
  type: ReportType;
  /** The period the change column compares with. */
  previous: DateRange;
};

/** The period's totals per category, ranked, with the change from the previous period. */
export async function getSpendingByCategory(filters: ReportFilters, type: ReportType): Promise<SpendingByCategory> {
  const previous = previousRange(filters.range);
  const totals = await getCategoryTotals(filters, type, filters.range, previous);
  // Categories that only existed in the previous period are not part of this period's ranking.
  return { ...totals, rows: totals.rows.filter((row) => toCents(row.a) > 0), type, previous };
}

// --- Period comparison ---

export type PeriodTotals = { a: string; b: string };

export type PeriodComparison = {
  type: ReportType;
  income: PeriodTotals;
  expense: PeriodTotals;
  net: PeriodTotals;
  categories: CategoryTotal[];
};

/** Two periods side by side: income, expenses, net and every category's difference. */
export async function getPeriodComparison(
  filters: ReportFilters,
  comparison: Comparison,
  type: ReportType,
): Promise<PeriodComparison> {
  const scope = await requireHouseholdScope();
  const userIds = readableUserIds(scope, filters);
  const { aRange, bRange } = comparison;

  const [totals] = await cached(
    { name: "periodTotals", memberIds: scope.memberIds, args: { userIds, filters, aRange, bRange } },
    () =>
      getDb()
        .select({
          incomeA: sumOf("income", aRange),
          incomeB: sumOf("income", bRange),
          expenseA: sumOf("expense", aRange),
          expenseB: sumOf("expense", bRange),
        })
        .from(transactions)
        .where(and(...transactionConditions(userIds, filters), or(within(aRange), within(bRange)))),
  );

  const net = (income: string, expense: string) => fromCents(toCents(income) - toCents(expense));
  const categoryTotals = await getCategoryTotals(filters, type, aRange, bRange);

  return {
    type,
    income: { a: totals.incomeA, b: totals.incomeB },
    expense: { a: totals.expenseA, b: totals.expenseB },
    net: { a: net(totals.incomeA, totals.expenseA), b: net(totals.incomeB, totals.expenseB) },
    categories: categoryTotals.rows,
  };
}

// --- Forecast ---

export type ForecastCategory = {
  key: string | null;
  name: string;
  color: string;
  icon: string | null;
  /** Spending in the last complete month, the monthly average and the projected amount per month. */
  last: string;
  average: string;
  forecast: string;
  trend: Trend;
  /** Recent months against older months; null when the older months were zero. */
  change: number | null;
};

export type ForecastMonth = {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  /** Spent (history months) or projected (months ahead); the last history month has both, so the lines join. */
  actual: string | null;
  forecast: string | null;
};

export type ForecastData = {
  /** False when there are no expenses in the complete months of the period. */
  hasData: boolean;
  /** Complete months of the period the forecast rests on. */
  historyMonths: number;
  /** False when `historyMonths` is below the minimum; nothing is projected then. */
  canForecast: boolean;
  months: ForecastMonth[];
  categories: ForecastCategory[];
  /** Total projected per month, and over all the months ahead. */
  monthly: string;
  horizon: string;
  /** All categories together: last month, average, and the trend of the totals. */
  last: string;
  average: string;
  trend: Trend;
  change: number | null;
  yearEnd: { year: string; spentSoFar: string; projected: string } | null;
};

const EMPTY_FORECAST: ForecastData = {
  hasData: false,
  historyMonths: 0,
  canForecast: false,
  months: [],
  categories: [],
  monthly: "0.00",
  horizon: "0.00",
  last: "0.00",
  average: "0.00",
  trend: "stable",
  change: 0,
  yearEnd: null,
};

/**
 * Expense history per category and month, projected forward: each category's monthly average,
 * scaled by how its recent months compare with its older ones (lib/reports/forecast.ts). Only
 * complete months count, and the projection starts the month after the last one.
 */
export async function getForecastData(filters: ReportFilters, today: string): Promise<ForecastData> {
  const scope = await requireHouseholdScope();
  const userIds = readableUserIds(scope, filters);
  const t = await getT();
  const complete = completeMonths(filters.range, today);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  if (complete.length === 0) return EMPTY_FORECAST;

  const group = sql`lower(${categories.name})`;
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM-01')`;
  const span = { start: complete[0], end: monthRange(complete[complete.length - 1]).end };

  const { rows, ytd } = await cached(
    { name: "forecastRows", memberIds: scope.memberIds, args: { userIds, filters, span, yearStart, today } },
    async () => {
      const db = getDb();
      const conditions = transactionConditions(userIds, filters);
      const [rows, [ytd]] = await Promise.all([
        db
          .select({
            name: sql<string | null>`min(${categories.name})`,
            color: sql<string | null>`min(${categories.color})`,
            icon: sql<string | null>`min(${categories.icon})`,
            month,
            amount: sumOf("expense"),
          })
          .from(transactions)
          .leftJoin(categories, eq(categories.id, transactions.categoryId))
          .where(and(...conditions, eq(transactions.type, "expense"), within(span)))
          .groupBy(group, month),
        db
          .select({ amount: sumOf("expense") })
          .from(transactions)
          .where(and(...conditions, eq(transactions.type, "expense"), within({ start: yearStart, end: today }))),
      ]);
      return { rows, ytd: ytd.amount };
    },
  );

  if (rows.length === 0) return EMPTY_FORECAST;

  // Months before the first expense are not history (a new user's empty months would drag the average down).
  const firstMonth = rows.reduce((first, row) => (row.month < first ? row.month : first), rows[0].month);
  const history = complete.filter((start) => start >= firstMonth);

  const byCategory = new Map<string, { name: string | null; color: string | null; icon: string | null; cents: number[] }>();
  for (const row of rows) {
    const id = row.name === null ? "" : row.name.toLowerCase();
    const entry = byCategory.get(id) ?? { name: row.name, color: row.color, icon: row.icon, cents: history.map(() => 0) };
    entry.cents[history.indexOf(row.month)] += toCents(row.amount);
    byCategory.set(id, entry);
  }

  const lines = [...byCategory.values()]
    .map((entry) =>
      forecastLine({
        key: entry.name === null ? null : `expense:${entry.name}`,
        name: entry.name ?? t("Uncategorized"),
        color: entry.color ?? UNCATEGORIZED_COLOR,
        icon: entry.icon,
        cents: entry.cents,
      }),
    )
    .sort((x, y) => y.forecastCents - x.forecastCents || x.name.localeCompare(y.name));

  const totals = history.map((_, index) => lines.reduce((sum, line) => sum + line.cents[index], 0));
  const totalTrend = trendOf(totals);
  const canForecast = history.length >= MIN_HISTORY_MONTHS;
  const monthly = lines.reduce((sum, line) => sum + line.forecastCents, 0);
  const average = lines.reduce((sum, line) => sum + line.averageCents, 0);
  const ahead = FORECAST_MONTHS;

  const months: ForecastMonth[] = history.map((start, index) => ({
    month: start,
    actual: fromCents(totals[index]),
    forecast: canForecast && index === history.length - 1 ? fromCents(totals[index]) : null,
  }));
  if (canForecast) {
    for (let step = 1; step <= ahead; step++) {
      months.push({ month: addMonths(history[history.length - 1], step), actual: null, forecast: fromCents(monthly) });
    }
  }

  return {
    hasData: true,
    historyMonths: history.length,
    canForecast,
    months,
    categories: lines.map((line) => ({
      key: line.key,
      name: line.name,
      color: line.color,
      icon: line.icon,
      last: fromCents(line.lastCents),
      average: fromCents(line.averageCents),
      forecast: fromCents(line.forecastCents),
      trend: line.trend.direction,
      change: line.trend.change,
    })),
    monthly: fromCents(monthly),
    horizon: fromCents(monthly * ahead),
    last: fromCents(totals[totals.length - 1]),
    average: fromCents(average),
    trend: totalTrend.direction,
    change: totalTrend.change,
    yearEnd: canForecast
      ? {
          year: today.slice(0, 4),
          spentSoFar: ytd,
          projected: fromCents(yearEndCents(toCents(ytd), average, today)),
        }
      : null,
  };
}

// --- Balance over time ---

export type BalanceAccount = {
  id: string;
  name: string;
  /** Set only when the household has several people, to tell their accounts apart. */
  ownerName?: string;
  color: string;
  /** Balance at the end of each month of `months`. */
  values: string[];
};

export type BalanceOverTime = {
  /** First day of each month, `YYYY-MM-DD`. */
  months: string[];
  /** All shown accounts together, one value per month. */
  total: string[];
  accounts: BalanceAccount[];
  /** Last value minus the one before the period (the first month's opening balance). */
  change: string;
  opening: string;
};

/**
 * Account balance at the end of each month: initial balance plus income, minus expenses, plus
 * transfers in, minus transfers out, minus money put into goals (plus money taken back out), up to that month. Only the person and account filters apply;
 * category, tag and note filters do not make sense for a balance.
 */
export async function getBalanceOverTime(filters: ReportFilters): Promise<BalanceOverTime> {
  const scope = await requireHouseholdScope();
  const userIds = readableUserIds(scope, filters);
  const db = getDb();
  const months = monthStarts(filters.range);

  // The two database reads are cached together; names and sums are worked out below.
  const { accountRows, deltaRows } = await cached(
    { name: "balanceRows", memberIds: scope.memberIds, args: { userIds, filters, start: months[0] } },
    async () => {
      const accountRows = await db
        .select({
          id: accounts.id,
          userId: accounts.userId,
          name: accounts.name,
          color: accounts.color,
          initialBalance: accounts.initialBalance,
        })
        .from(accounts)
        .where(and(inArray(accounts.userId, userIds), filters.accountId ? eq(accounts.id, filters.accountId) : undefined))
        .orderBy(asc(accounts.createdAt), asc(accounts.name));

      let deltaRows: Array<{ account_id: string; month: string; delta: string }> = [];
      if (accountRows.length > 0) {
        const ids = sql.join(
          accountRows.map((account) => sql`${account.id}::uuid`),
          sql`, `,
        );
        // Every movement of money on these accounts up to the end of the period. Everything before
        // the first month is one row per account ('' = opening), so the cost of old history is a
        // single sum instead of a group per month.
        const start = months[0];
        const rows = await db.execute<{ account_id: string; month: string; delta: string }>(sql`
          select account_id, case when date < ${start}::date then '' else to_char(date, 'YYYY-MM-01') end as month,
                 sum(signed)::numeric(14,2)::text as delta
          from (
            select account_id, date, case when type = 'income' then amount else -amount end as signed
              from transactions where account_id in (${ids}) and date <= ${filters.range.end}
            union all
            select to_account_id, date, amount from transfers where to_account_id in (${ids}) and date <= ${filters.range.end}
            union all
            select from_account_id, date, -amount from transfers where from_account_id in (${ids}) and date <= ${filters.range.end}
            union all
            select account_id, date, case when type = 'deposit' then -amount else amount end
              from goal_contributions where account_id in (${ids}) and date <= ${filters.range.end}
          ) as movements
          group by account_id, 2
        `);
        deltaRows = rows.map((row) => ({ account_id: row.account_id, month: row.month, delta: row.delta }));
      }
      return { accountRows, deltaRows };
    },
  );

  const deltas = new Map<string, Map<string, number>>();
  for (const row of deltaRows) {
    const perMonth = deltas.get(row.account_id) ?? new Map<string, number>();
    perMonth.set(row.month, toCents(row.delta));
    deltas.set(row.account_id, perMonth);
  }

  const showOwner = userIds.length > 1;
  const series = accountRows.map((account) => {
    const perMonth = deltas.get(account.id) ?? new Map<string, number>();
    let running = toCents(account.initialBalance);
    for (const [month, delta] of perMonth) if (month < months[0]) running += delta;
    const opening = running;
    const values = months.map((month) => {
      running += perMonth.get(month) ?? 0;
      return running;
    });
    return {
      id: account.id,
      name: account.name,
      ownerName: showOwner ? scope.names.get(account.userId) : undefined,
      color: account.color,
      opening,
      values,
    };
  });

  const total = months.map((_, index) => series.reduce((sum, account) => sum + account.values[index], 0));
  const opening = series.reduce((sum, account) => sum + account.opening, 0);

  return {
    months,
    total: total.map(fromCents),
    accounts: series.map((account) => ({
      id: account.id,
      name: account.name,
      ownerName: account.ownerName,
      color: account.color,
      values: account.values.map(fromCents),
    })),
    change: fromCents((total.at(-1) ?? opening) - opening),
    opening: fromCents(opening),
  };
}

// --- Filter choices ---

/** What the filter bar offers: accounts, categories and tags across the household, and its people. */
export async function getReportFilterOptions() {
  const [own, shared, categoryOptions, tagNames, household] = await Promise.all([
    listAccounts(),
    listHouseholdAccounts(),
    listFilterCategories(),
    listFilterTags(),
    getHouseholdOverview(),
  ]);
  return {
    accounts: [...own, ...shared.map((account) => ({ ...account, name: `${account.ownerName} · ${account.name}` }))],
    categories: categoryOptions,
    tags: tagNames,
    people: household.members,
  };
}

export type ReportFilterOptions = Awaited<ReturnType<typeof getReportFilterOptions>>;
