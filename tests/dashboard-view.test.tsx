// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard/DashboardView";
import type { Dashboard } from "@/lib/data/dashboard";
import { renderServer } from "./helpers/server-render";

// The charts are SVG measured by the browser; their numbers are checked through the legend and tables.
vi.mock("@/components/reports/charts", () => ({
  CashFlowChart: ({ data }: { data: unknown[] }) => <div data-testid="cash-flow-chart" data-points={data.length} />,
  SpendingDonut: ({ data }: { data: Array<{ name: string }> }) => (
    <div data-testid="donut" data-slices={data.map((slice) => slice.name).join(",")} />
  ),
}));

const data = (overrides: Partial<Dashboard> = {}): Dashboard => ({
  scope: "mine",
  inHousehold: false,
  month: { start: "2026-10-01", end: "2026-10-31" },
  totalBalance: "3580.15",
  income: "3005.00",
  expense: "1174.85",
  net: "1830.15",
  accounts: [
    { id: "a1", name: "Cash", type: "cash", color: "#9cca56", icon: "banknote", initialBalance: "250.00", isDefault: false, balance: "2644.50" },
    { id: "a2", name: "Credit card", type: "card", color: "#ea9150", icon: "credit-card", initialBalance: "0.00", isDefault: false, balance: "-64.35" },
  ],
  budgets: [
    {
      id: "b1",
      period: "monthly",
      amount: "1000.00",
      category: { id: "c1", name: "Rent", color: "#337ab7", icon: "home" },
      range: { start: "2026-10-01", end: "2026-10-31" },
      spent: "1100.50",
      remaining: "-100.50",
      elapsedPercent: 50,
      projected: null,
      planned: "0.00",
      history: [],
      lastSpent: "0.00",
      forecast: null,
      trend: null,
    },
    {
      id: "b2",
      period: "weekly",
      amount: "100.00",
      category: { id: "c2", name: "Groceries", color: "#9cca56", icon: "shopping-cart" },
      range: { start: "2026-10-05", end: "2026-10-11" },
      spent: "40.00",
      remaining: "60.00",
      elapsedPercent: 50,
      projected: null,
      planned: "0.00",
      history: [],
      lastSpent: "0.00",
      forecast: null,
      trend: null,
    },
  ],
  goals: { inGoals: "0.00", active: [] },
  recurring: [
    {
      id: "r1",
      kind: "expense",
      amount: "850.00",
      accountId: "a1",
      accountName: "Cash",
      categoryId: "c1",
      categoryName: "Rent",
      fromAccountId: null,
      fromAccountName: null,
      toAccountId: null,
      toAccountName: null,
      goalId: null,
      goalName: null,
      tagIds: [],
      note: null,
      frequency: "monthly",
      intervalCount: 1,
      startDate: "2026-01-01",
      endDate: null,
      nextDueDate: "2026-11-01",
      status: "active",
      pausedReason: null,
    },
  ],
  recent: [
    {
      id: "t1",
      type: "expense",
      amount: "64.35",
      date: "2026-10-08",
      note: "Weekly shop",
      account: { id: "a1", name: "Cash", ownerName: "Me", isMine: true },
      transferTo: null,
      category: { id: "c2", name: "Groceries", color: "#9cca56", icon: "shopping-cart" },
      tags: [],
    recurring: false,
    owner: { id: "u1", name: "Me", isMine: true },
    },
    {
      id: "t2",
      type: "income",
      amount: "3000.00",
      date: "2026-10-01",
      note: null,
      account: { id: "a1", name: "Cash", ownerName: "Me", isMine: true },
      transferTo: null,
      category: { id: "c3", name: "Salary", color: "#9cca56", icon: "banknote" },
      tags: [],
    recurring: false,
    owner: { id: "u1", name: "Me", isMine: true },
    },
    {
      id: "t3",
      type: "expense",
      amount: "2.00",
      date: "2026-09-30",
      note: null,
      account: { id: "a2", name: "Credit card", ownerName: "Me", isMine: true },
      transferTo: null,
      category: null,
      tags: [],
    recurring: false,
    owner: { id: "u1", name: "Me", isMine: true },
    },
    {
      id: "t4",
      type: "transfer",
      amount: "25.00",
      date: "2026-09-29",
      note: null,
      account: { id: "a1", name: "Cash", ownerName: "Me", isMine: true },
      transferTo: { id: "a2", name: "Credit card", ownerName: "Me", isMine: true },
      category: null,
      tags: [],
    recurring: false,
    owner: { id: "u1", name: "Me", isMine: true },
    },
  ],
  spending: {
    type: "expense",
    previous: { start: "2026-09-01", end: "2026-09-30" },
    totalA: "1174.85",
    totalB: "900.00",
    rows: [
      { key: "expense:Rent", name: "Rent", color: "#337ab7", icon: "home", a: "1100.50", b: "900.00", share: 0.9367, delta: "200.50", change: 0.2228 },
      { key: "expense:Groceries", name: "Groceries", color: "#9cca56", icon: "shopping-cart", a: "64.35", b: "0.00", share: 0.0548, delta: "64.35", change: null },
      { key: null, name: "Uncategorized", color: "#8a9a9f", icon: null, a: "10.00", b: "0.00", share: 0.0085, delta: "10.00", change: null },
    ],
  },
  cashFlow: {
    months: [
      { month: "2026-09-01", income: "700.00", expense: "0.00", net: "700.00" },
      { month: "2026-10-01", income: "3005.00", expense: "1174.85", net: "1830.15" },
    ],
    income: "3705.00",
    expense: "1174.85",
    net: "2530.15",
    savingsRate: 0.68,
    hasData: true,
  },
  lastMonthToDate: { range: { start: "2026-09-01", end: "2026-09-08" }, income: "3045.00", expense: "1287.85", net: "1757.15" },
  savingsRate: 0.4,
  balanceTrend: ["2000.00", "2500.00", "3000.00", "2040.15", "2040.15", "3580.15"],
  balanceChange: "1540.00",
  ...overrides,
});

const noCharts = { spending: { type: "expense" as const, previous: { start: "2026-09-01", end: "2026-09-30" }, totalA: "0.00", totalB: "0.00", rows: [] }, cashFlow: { months: [], income: "0.00", expense: "0.00", net: "0.00", savingsRate: null, hasData: false } };

const empty = (): Dashboard => data({ totalBalance: "0.00", income: "0.00", expense: "0.00", net: "0.00", accounts: [], budgets: [], recurring: [], recent: [], ...noCharts });

afterEach(cleanup);

describe("DashboardView", () => {
  it("lists the goals with progress, and notes how much is set aside in goals", async () => {
    const goal = (extra: Partial<Dashboard["goals"]["active"][number]> = {}) => ({
      id: "g1",
      name: "Travel to Japan",
      icon: "plane",
      color: "#ffd100",
      targetAmount: "1000.00",
      deadline: "2026-12-01",
      shared: true,
      note: null,
      archived: false,
      saved: "250.00",
      mySaved: "250.00",
      used: true,
      owner: { id: "u1", name: "Me", isMine: true },
      createdAt: new Date("2026-09-01"),
      ...extra,
    });
    await renderServer(
      <DashboardView
        currency="USD"
        today="2026-10-11"
        data={data({ goals: { inGoals: "300.00", active: [goal(), goal({ id: "g2", name: "Old car", deadline: "2026-09-01", shared: false, saved: "10.00" })] } })}
      />,
    );
    const summary = screen.getByLabelText("Summary");
    expect(within(summary).getByText("$300.00 set aside in goals")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Goals" });
    expect(within(card).getByRole("link", { name: "Travel to Japan" })).toHaveAttribute("href", "/goals/g1");
    expect(within(card).getByRole("progressbar", { name: "Travel to Japan progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(within(card).getByText("$250.00 of $1,000.00 · due Dec 1, 2026")).toBeInTheDocument();
    expect(within(card).getByText("$10.00 of $1,000.00 · overdue since Sep 1, 2026")).toBeInTheDocument();
    expect(within(card).getAllByText("Shared")).toHaveLength(1);
    expect(within(card).getByRole("link", { name: "All goals" })).toHaveAttribute("href", "/goals");
  });

  it("invites the user to create a first goal and shows no goals note", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const card = screen.getByRole("region", { name: "Goals" });
    expect(within(card).getByRole("link", { name: "Create your first goal" })).toHaveAttribute("href", "/goals");
    expect(screen.queryByText(/set aside in goals/)).not.toBeInTheDocument();
  });

  it("names the current month", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("shows the total balance, income, expense and net for the month", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const summary = screen.getByLabelText("Summary");
    const value = (label: string) => within(summary).getByText(label).nextElementSibling;
    expect(value("Total balance")).toHaveTextContent("$3,580.15");
    expect(value("Income this month")).toHaveTextContent("$3,005.00");
    expect(value("Expense this month")).toHaveTextContent("$1,174.85");
    expect(value("Net this month")).toHaveTextContent("+$1,830.15");
    expect(value("Net this month")).toHaveClass("text-income-text");
    expect(value("Income this month")).toHaveClass("text-income-text");
    expect(value("Expense this month")).toHaveClass("text-expense-text");
  });

  it("compares each tile with the same days of last month, green when better and red when worse", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const summary = screen.getByLabelText("Summary");
    const change = (label: string) => within(summary).getByText(label).nextElementSibling!.nextElementSibling;
    // Less income than the same days last month is bad news ...
    expect(change("Income this month")).toHaveTextContent("-$40.00 (-1.3%) vs. Sep 1-8");
    expect(change("Income this month")).toHaveClass("text-expense-text");
    // ... less expense is good news ...
    expect(change("Expense this month")).toHaveTextContent("-$113.00 (-8.8%) vs. Sep 1-8");
    expect(change("Expense this month")).toHaveClass("text-income-text");
    // ... and the balance change needs no comparison.
    expect(change("Net this month")).toHaveTextContent("+$73.00 (+4.2%) vs. Sep 1-8");
    expect(change("Net this month")).toHaveClass("text-income-text");
    expect(change("Total balance")).toHaveTextContent("+$1,540.00 this month");
    expect(change("Total balance")).toHaveClass("text-income-text");
  });

  it("shows a neutral change when nothing moved, and no percentage without a base to compare with", async () => {
    await renderServer(
      <DashboardView currency="USD" today="2026-10-11"
        data={data({
          balanceChange: "0.00",
          lastMonthToDate: { range: { start: "2026-09-01", end: "2026-09-08" }, income: "3005.00", expense: "0.00", net: "0.00" },
        })}
      />,
    );
    const summary = screen.getByLabelText("Summary");
    const change = (label: string) => within(summary).getByText(label).nextElementSibling!.nextElementSibling;
    expect(change("Income this month")).toHaveTextContent("$0.00 (0.0%) vs. Sep 1-8");
    expect(change("Income this month")).toHaveClass("text-muted");
    expect(change("Expense this month")).toHaveTextContent("+$1,174.85 vs. Sep 1-8");
    expect(change("Expense this month")).not.toHaveTextContent("%");
    expect(change("Expense this month")).toHaveClass("text-expense-text");
    expect(change("Total balance")).toHaveTextContent("$0.00 this month");
    expect(change("Total balance")).toHaveClass("text-muted");
  });

  it("shows how much of the income was saved, or that more was spent than earned", async () => {
    const { unmount } = await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    expect(screen.getByText("40.0% of income saved")).toBeInTheDocument();
    unmount();
    const { unmount: second } = await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data({ savingsRate: -0.2 })} />);
    expect(screen.getByText("Spent more than earned")).toBeInTheDocument();
    second();
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data({ savingsRate: null })} />);
    expect(screen.queryByText(/of income saved|Spent more than earned/)).not.toBeInTheDocument();
  });

  it("draws a trend line per tile and the tiles are plain, not links", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const summary = screen.getByLabelText("Summary");
    expect(within(summary).getAllByRole("img")).toHaveLength(4);
    expect(within(summary).getByRole("img", { name: "Total balance at the end of each of the last 6 months" })).toBeInTheDocument();
    expect(within(summary).queryAllByRole("link")).toHaveLength(0);
  });

  it("shows a negative net in the expense color and zero without a color", async () => {
    const { unmount } = await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data({ net: "-20.00" })} />);
    expect(screen.getByText("Net this month").nextElementSibling).toHaveTextContent("-$20.00");
    expect(screen.getByText("Net this month").nextElementSibling).toHaveClass("text-expense-text");
    unmount();
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data({ net: "0.00" })} />);
    const net = screen.getByText("Net this month").nextElementSibling;
    expect(net).toHaveTextContent("$0.00");
    expect(net).not.toHaveClass("text-income-text", "text-expense-text");
  });

  it("lists each account with its type and balance, negative balances in red", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const accounts = screen.getByRole("region", { name: "Accounts" });
    const [cash, card] = within(accounts).getAllByRole("listitem");
    expect(within(cash).getByText("Cash", { selector: "span.truncate" })).toBeInTheDocument();
    expect(within(cash).getByText("$2,644.50")).toBeInTheDocument();
    expect(within(card).getByText("Credit card")).toBeInTheDocument();
    expect(within(card).getByText("Card")).toBeInTheDocument();
    expect(within(card).getByText("-$64.35")).toHaveClass("text-expense-text");
  });

  it("shows budget progress with the period, and red once a budget is over", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const budgets = screen.getByRole("region", { name: "Budgets" });
    const [rent, groceries] = within(budgets).getAllByRole("listitem");

    expect(within(rent).getByText("Rent")).toBeInTheDocument();
    expect(within(rent).getByText("Monthly")).toBeInTheDocument();
    expect(within(rent).getByText(/\$1,100\.50 of \$1,000\.00 · over by \$100\.50/)).toHaveClass("text-expense-text");
    const rentBar = within(rent).getByRole("progressbar");
    expect(rentBar).toHaveAttribute("aria-valuenow", "100");
    expect(rentBar.firstElementChild).toHaveClass("bg-expense");

    expect(within(groceries).getByText("Weekly")).toBeInTheDocument();
    expect(within(groceries).getByText("$40.00 of $100.00")).not.toHaveClass("text-expense-text");
    const bar = within(groceries).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar.firstElementChild).toHaveClass("bg-primary");

    expect(within(budgets).getByRole("link", { name: "All budgets" })).toHaveAttribute("href", "/budgets");
  });

  it("shows the recent transactions with a green +income, plain expenses and a link to all of them", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const recent = screen.getByRole("region", { name: "Recent transactions" });
    const items = within(recent).getAllByRole("listitem");
    expect(items).toHaveLength(4);

    expect(items[0]).toHaveTextContent("Weekly shop");
    expect(items[0]).toHaveTextContent("Oct 8, 2026 · Cash · Groceries");
    expect(within(items[0]).getByText("$64.35")).toHaveClass("text-text");

    // Without a note, the category name stands in for it.
    expect(items[1]).toHaveTextContent("Salary");
    expect(within(items[1]).getByText("+$3,000.00")).toHaveClass("text-income-text");

    // Without a category either.
    expect(items[2]).toHaveTextContent("Uncategorized");
    expect(items[2]).toHaveTextContent("Sep 30, 2026 · Credit card");

    // A transfer has no sign or color, like an expense and names both accounts.
    expect(items[3]).toHaveTextContent("Transfer");
    expect(items[3]).toHaveTextContent("Sep 29, 2026 · Cash → Credit card");
    const moved = within(items[3]).getByText("$25.00");
    expect(moved).not.toHaveClass("text-income-text", "text-expense-text");

    expect(within(recent).getByRole("link", { name: "View all" })).toHaveAttribute("href", "/transactions");
  });

  it("shows this month's spending as a chart with the biggest categories listed beside it", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const card = screen.getByRole("region", { name: "Spending this month" });
    expect(within(card).getByTestId("donut")).toHaveAttribute("data-slices", "Rent,Groceries,Uncategorized");
    const [rent, groceries] = within(card).getAllByRole("listitem");
    expect(rent).toHaveTextContent("Rent");
    expect(rent).toHaveTextContent("$1,100.50");
    expect(rent).toHaveTextContent("93.7%");
    expect(groceries).toHaveTextContent("$64.35");
    expect(within(card).getByRole("link", { name: "Full report" })).toHaveAttribute("href", "/reports/spending");
  });

  it("adds up the categories after the first four as Other", async () => {
    const row = (name: string, a: string, share: number) => ({
      key: `expense:${name}`, name, color: "#337ab7", icon: "tag", a, b: "0.00", share, delta: a, change: null,
    });
    const rows = [row("A", "50.00", 0.5), row("B", "20.00", 0.2), row("C", "10.00", 0.1), row("D", "10.00", 0.1), row("E", "6.00", 0.06), row("F", "4.00", 0.04)];
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data({ spending: { ...data().spending, rows } })} />);
    const card = screen.getByRole("region", { name: "Spending this month" });
    expect(within(card).getByTestId("donut")).toHaveAttribute("data-slices", "A,B,C,D,Other");
    const other = within(card).getAllByRole("listitem")[4];
    expect(other).toHaveTextContent("Other");
    expect(other).toHaveTextContent("$10.00");
    expect(other).toHaveTextContent("10.0%");
  });

  it("shows the last months of income and expenses with a link to the report", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const card = screen.getByRole("region", { name: "Income vs. expenses" });
    expect(within(card).getByTestId("cash-flow-chart")).toHaveAttribute("data-points", "2");
    expect(within(card).getByRole("link", { name: "Full report" })).toHaveAttribute("href", "/reports/cash-flow");
  });

  it("lists the next recurring transactions and links to the Recurring page", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    const card = screen.getByRole("region", { name: "Recurring" });
    const [rule] = within(card).getAllByRole("listitem");
    expect(rule).toHaveTextContent("Rent · Cash");
    expect(rule).toHaveTextContent("Next");
    expect(rule).toHaveTextContent("Every month");
    expect(rule).toHaveTextContent("$850.00");
    expect(within(card).getByRole("link", { name: "All recurring" })).toHaveAttribute("href", "/profile/recurring");
  });

  it("explains each empty section and links to where to fill it", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={empty()} />);
    expect(screen.getByRole("link", { name: "Add an account" })).toHaveAttribute("href", "/profile/accounts");
    expect(screen.getByRole("link", { name: "Set a budget" })).toHaveAttribute("href", "/budgets");
    expect(screen.getByRole("link", { name: "Set one up" })).toHaveAttribute("href", "/profile/recurring");
    expect(screen.getByRole("link", { name: "Add your first transaction" })).toHaveAttribute("href", "/transactions");
    expect(screen.getByText("No expenses this month yet.")).toBeInTheDocument();
    expect(screen.getByText("No transactions in the last 6 months.")).toBeInTheDocument();
    expect(screen.queryByTestId("donut")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cash-flow-chart")).not.toBeInTheDocument();
    const summary = screen.getByLabelText("Summary");
    expect(within(summary).getAllByText("$0.00")).toHaveLength(4);
  });

  it("shows the Household | Mine switch only inside a household", async () => {
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data()} />);
    expect(screen.queryByRole("navigation", { name: "Dashboard view" })).not.toBeInTheDocument();
    cleanup();
    await renderServer(<DashboardView currency="USD" today="2026-10-11" data={data({ inHousehold: true, scope: "household" })} />);
    const nav = screen.getByRole("navigation", { name: "Dashboard view" });
    expect(within(nav).getByRole("link", { name: "Household" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Mine" })).toHaveAttribute("href", "/dashboard?scope=mine");
  });

  it("labels household members' accounts and transactions with their owner", async () => {
    const base = data();
    await renderServer(
      <DashboardView currency="USD" today="2026-10-11"
        data={data({
          inHousehold: true,
          scope: "household",
          accounts: [{ ...base.accounts[0], ownerName: "Ben" }],
          recent: [
            {
              ...base.recent[0],
              owner: { id: "u2", name: "Ben", isMine: false },
              account: { id: "x", name: "Cash", ownerName: "Ben", isMine: false },
            },
          ],
        })}
      />,
    );
    expect(within(screen.getByRole("region", { name: "Recent transactions" })).getByText(/Ben · Cash/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Accounts" })).getByText(/Ben ·/)).toBeInTheDocument();
  });
});
