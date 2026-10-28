import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { transactions } from "@/db/schema";
import { monthRange, periodRange, todayISO, type DateRange } from "@/lib/budget-period";
import { fromCents, savingsRate, toCents } from "@/lib/reports/money";
import { addDays, addMonths } from "@/lib/reports/periods";
import { listAccounts, listHouseholdAccounts, type AccountWithBalance } from "./accounts";
import { listBudgets, type BudgetItem } from "./budgets";
import { getGoalsOverview, type GoalsOverview } from "./goals";
import { cached } from "@/lib/cache";
import { requireHouseholdScope } from "./household";
import { listRecurringRules, type RecurringRuleItem } from "./recurring";
import { getBalanceOverTime, getCashFlow, getSpendingByCategory, type CashFlow, type SpendingByCategory } from "./reports";
import { listTransactions, type TransactionItem } from "./transactions";

export const DASHBOARD_BUDGET_LIMIT = 5;
export const DASHBOARD_RECENT_LIMIT = 5;
export const DASHBOARD_GOAL_LIMIT = 3;
export const DASHBOARD_RECURRING_LIMIT = 5;
/** The cash flow chart covers this many months, ending with the current one. */
export const DASHBOARD_CHART_MONTHS = 6;

/** "household" adds up everyone in the household; "mine" is only the current user. */
export type DashboardScope = "household" | "mine";

/** `ownerName` is set only for household members' accounts. */
export type DashboardAccount = AccountWithBalance & { ownerName?: string };

export type Dashboard = {
  scope: DashboardScope;
  /** True when the user shares a household with someone, so the Household | Mine switch applies. */
  inHousehold: boolean;
  /** The current calendar month. */
  month: DateRange;
  /** Sum of all account balances (initial balances + income - expenses, transfers and money set aside in goals), as text. */
  totalBalance: string;
  /** Income and expense recorded this month, and their difference, as text. */
  income: string;
  expense: string;
  net: string;
  accounts: DashboardAccount[];
  /** The budgets with the highest usage, each measured over its own period. */
  budgets: BudgetItem[];
  recent: TransactionItem[];
  /** The current user's active recurring rules that run next (rules are personal in both views). */
  recurring: RecurringRuleItem[];
  /** Money set aside in goals by the people in this view, and the goals to show. */
  goals: GoalsOverview;
  /** This month's expenses per category, for the spending chart. */
  spending: SpendingByCategory;
  /** Income and expenses for the last months, for the cash flow chart. */
  cashFlow: CashFlow;
  /** Income, expense and net of the same days of last month (1st to today's day number), for a fair comparison. */
  lastMonthToDate: { range: DateRange; income: string; expense: string; net: string };
  /** (income - expense) / income this month, or null without income. */
  savingsRate: number | null;
  /** Total balance at the end of each of the last months, oldest first, for the balance sparkline. */
  balanceTrend: string[];
  /** How much the total balance changed this month. */
  balanceChange: string;
};

/** Everything the dashboard shows for the current user. `today` defaults to today in the user's timezone. */
export async function getDashboard(
  requestedToday?: string,
  requestedScope: DashboardScope = "household",
): Promise<Dashboard> {
  const user = await requireUser();
  const today = requestedToday ?? todayISO(user.timezone);
  const household = await requireHouseholdScope();
  const inHousehold = household.memberIds.length > 1;
  const scope: DashboardScope = inHousehold ? requestedScope : "mine";
  // Reads cover the household (or just me); budgets stay personal in both views.
  const userIds = scope === "household" ? household.memberIds : [household.userId];
  const db = getDb();
  const month = periodRange("monthly", today);

  const monthTotals = cached({ name: "monthTotals", memberIds: household.memberIds, args: { userIds, month } }, async () => {
    const [row] = await db
      .select({
        income: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} end), 0)::numeric(14,2)::text`,
        expense: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} end), 0)::numeric(14,2)::text`,
        net: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end), 0)::numeric(14,2)::text`,
      })
      .from(transactions)
      .where(
        and(inArray(transactions.userId, userIds), gte(transactions.date, month.start), lte(transactions.date, month.end)),
      );
    return row;
  });

  // The charts reuse the reports, for the same people as the numbers above.
  const reportFilters = { personId: scope === "mine" ? household.userId : undefined };

  // Last month up to the same day of the month, so a half-finished month is not compared with a full one.
  const lastMonth = monthRange(addMonths(today, -1));
  const sameDays: DateRange = {
    start: lastMonth.start,
    end: [addDays(lastMonth.start, Number(today.slice(8, 10)) - 1), lastMonth.end].sort()[0],
  };

  const [totals, ownAccounts, sharedAccounts, budgetList, recurringRules, recent, spending, cashFlow, toDate, balances, goalsOverview] = await Promise.all([
    monthTotals,
    listAccounts(),
    scope === "household" ? listHouseholdAccounts() : Promise.resolve([]),
    listBudgets(today),
    listRecurringRules(),
    listTransactions({ page: 1, personId: scope === "mine" ? household.userId : undefined }, DASHBOARD_RECENT_LIMIT),
    getSpendingByCategory({ ...reportFilters, range: month }, "expense"),
    getCashFlow({ ...reportFilters, range: { start: addMonths(today, 1 - DASHBOARD_CHART_MONTHS), end: month.end } }),
    getCashFlow({ ...reportFilters, range: sameDays }),
    getBalanceOverTime({ ...reportFilters, range: { start: addMonths(today, 1 - DASHBOARD_CHART_MONTHS), end: month.end } }),
    getGoalsOverview(userIds, DASHBOARD_GOAL_LIMIT),
  ]);
  // The total is the sum of the balances shown below: one calculation of the history, not two.
  const total = fromCents([...ownAccounts, ...sharedAccounts].reduce((sum, account) => sum + toCents(account.balance), 0));
  const balanceChange = balances.total.length >= 2 ? toCents(balances.total.at(-1)!) - toCents(balances.total.at(-2)!) : 0;

  return {
    scope,
    inHousehold,
    month,
    totalBalance: total,
    income: totals.income,
    expense: totals.expense,
    net: totals.net,
    accounts: [...ownAccounts, ...sharedAccounts],
    budgets: budgetList.slice(0, DASHBOARD_BUDGET_LIMIT),
    recurring: recurringRules.filter((rule) => rule.status === "active").slice(0, DASHBOARD_RECURRING_LIMIT),
    recent: recent.items,
    goals: goalsOverview,
    spending,
    cashFlow,
    lastMonthToDate: { range: sameDays, income: toDate.income, expense: toDate.expense, net: toDate.net },
    savingsRate: savingsRate(toCents(totals.income), toCents(totals.expense)),
    balanceTrend: balances.total,
    balanceChange: fromCents(balanceChange),
  };
}
