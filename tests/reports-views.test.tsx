// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BalanceReport } from "@/components/reports/BalanceReport";
import { CashFlowReport } from "@/components/reports/CashFlowReport";
import { ComparisonReport } from "@/components/reports/ComparisonReport";
import { ForecastReport } from "@/components/reports/ForecastReport";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { SpendingReport } from "@/components/reports/SpendingReport";
import type { BalanceOverTime, CashFlow, ForecastData, PeriodComparison, ReportFilterOptions, SpendingByCategory } from "@/lib/data/reports";
import { parseComparison, type ReportFilters as Filters } from "@/lib/validation/reports";
import { renderServer, rerenderServer } from "./helpers/server-render";

// The charts are SVG measured by the browser; the tables next to them carry the same numbers.
vi.mock("@/components/reports/charts", () => ({
  CashFlowChart: () => <div data-testid="cash-flow-chart" />,
  SpendingDonut: () => <div data-testid="donut" />,
  ComparisonChart: () => <div data-testid="comparison-chart" />,
  BalanceChart: () => <div data-testid="balance-chart" />,
  AccountsBalanceChart: () => <div data-testid="accounts-chart" />,
  ForecastChart: ({ data }: { data: unknown[] }) => <div data-testid="forecast-chart" data-points={JSON.stringify(data)} />,
}));

afterEach(cleanup);

const filters: Filters = { range: { start: "2026-10-01", end: "2026-10-31" } };

describe("CashFlowReport", () => {
  const data: CashFlow = {
    months: [
      { month: "2026-09-01", income: "0.00", expense: "100.00", net: "-100.00" },
      { month: "2026-10-01", income: "3000.00", expense: "1000.00", net: "2000.00" },
    ],
    income: "3000.00",
    expense: "1100.00",
    net: "1900.00",
    savingsRate: 0.6333,
    hasData: true,
  };

  it("shows the headline cards, the chart and the monthly table", async () => {
    await renderServer(<CashFlowReport currency="USD" data={data} />);
    const totals = within(screen.getByLabelText("Totals for the period"));
    expect(totals.getByText("$3,000.00")).toBeTruthy();
    expect(totals.getByText("$1,100.00")).toBeTruthy();
    expect(totals.getByText("$1,900.00")).toBeTruthy();
    expect(totals.getByText("63.3%")).toBeTruthy();
    expect(screen.getByTestId("cash-flow-chart")).toBeTruthy();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Sep 26")).toBeTruthy();
    expect(within(rows[1]).getByText("-$100.00")).toBeTruthy();
    expect(within(rows[1]).getByText("n/a")).toBeTruthy();
    expect(within(rows[2]).getByText("66.7%")).toBeTruthy();
  });

  it("says n/a without income and shows an empty state without data", async () => {
    const { rerender } = await renderServer(<CashFlowReport currency="USD" data={{ ...data, savingsRate: null }} />);
    expect(screen.getByText("n/a", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("No income in this period")).toBeTruthy();
    await rerenderServer(rerender, <CashFlowReport currency="USD" data={{ ...data, hasData: false }} />);
    expect(screen.getByText("No transactions to report")).toBeTruthy();
    expect(screen.queryByTestId("cash-flow-chart")).toBeNull();
  });
});

describe("SpendingReport", () => {
  const data: SpendingByCategory = {
    type: "expense",
    previous: { start: "2026-09-01", end: "2026-09-30" },
    totalA: "1100.00",
    totalB: "1000.00",
    rows: [
      { key: "expense:Rent", name: "Rent", color: "#337ab7", icon: "home", a: "1000.00", b: "900.00", share: 0.909, delta: "100.00", change: 0.1111 },
      { key: "expense:Food & Drink", name: "Food & Drink", color: "#9cca56", icon: "utensils", a: "90.00", b: "100.00", share: 0.0818, delta: "-10.00", change: -0.1 },
      { key: null, name: "Uncategorized", color: "#8a9a9f", icon: null, a: "10.00", b: "0.00", share: 0.0091, delta: "10.00", change: null },
    ],
  };

  it("ranks categories with share, change and a drill-down link that keeps the filters", async () => {
    await renderServer(<SpendingReport currency="USD" data={data} filters={{ ...filters, accountId: "acc-1", tag: "Trip", q: "x y" }} />);
    expect(screen.getByTestId("donut")).toBeTruthy();
    expect(screen.getByText("Change compares with Sep 2026.")).toBeTruthy();
    const rent = screen.getByRole("link", { name: "Rent" });
    const url = new URL(rent.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/transactions");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      category: "expense:Rent",
      account: "acc-1",
      tag: "Trip",
      q: "x y",
    });
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("+11.1%")).toBeTruthy();
    expect(within(rows[1]).getByText("90.9%")).toBeTruthy();
    expect(within(rows[2]).getByText("-10.0%")).toBeTruthy();
    // No category to drill into, and "New" instead of a percentage with nothing to compare.
    expect(within(rows[3]).queryByRole("link")).toBeNull();
    expect(within(rows[3]).getByText("New")).toBeTruthy();
  });

  it("treats more spending as bad and more income as good", async () => {
    const { rerender } = await renderServer(<SpendingReport currency="USD" data={data} filters={filters} />);
    expect(screen.getByText("+11.1%").closest("td")!.className).toContain("text-expense-text");
    await rerenderServer(rerender, <SpendingReport currency="USD" data={{ ...data, type: "income" }} filters={filters} />);
    expect(screen.getByText("+11.1%").closest("td")!.className).toContain("text-income-text");
    expect(screen.getByText("Where the money came from")).toBeTruthy();
  });

  it("shows an empty state, and a dash when the previous period was empty but so is this", async () => {
    const { rerender } = await renderServer(<SpendingReport currency="USD" data={{ ...data, rows: [] }} filters={filters} />);
    expect(screen.getByText("No expenses to report")).toBeTruthy();
    await rerenderServer(rerender, <SpendingReport currency="USD" data={{ ...data, type: "income", rows: [] }} filters={filters} />);
    expect(screen.getByText("No income to report")).toBeTruthy();
    await rerenderServer(rerender, 
      <SpendingReport currency="USD"
        data={{ ...data, previous: { start: "2026-08-01", end: "2026-09-30" }, rows: [{ ...data.rows[0], change: null, b: "5.00" }] }}
        filters={filters}
      />,
    );
    expect(screen.getByText("Change compares with Aug 1, 2026 to Sep 30, 2026.")).toBeTruthy();
    expect(screen.getByText("–")).toBeTruthy();
  });
});

describe("ComparisonReport", () => {
  const comparison = parseComparison({ a: "2026-10", b: "2026-09" }, "2026-10-08");
  const data: PeriodComparison = {
    type: "expense",
    income: { a: "3000.00", b: "3100.00" },
    expense: { a: "1100.00", b: "1000.00" },
    net: { a: "1900.00", b: "2100.00" },
    categories: [
      { key: "expense:Rent", name: "Rent", color: "#337ab7", icon: "home", a: "1000.00", b: "1000.00", share: 0.9, delta: "0.00", change: 0 },
      { key: "expense:Food", name: "Food", color: "#9cca56", icon: "utensils", a: "100.00", b: "0.00", share: 0.1, delta: "100.00", change: null },
      { key: null, name: "Uncategorized", color: "#8a9a9f", icon: null, a: "0.00", b: "0.00", share: 0, delta: "0.00", change: null },
    ],
  };

  it("shows totals for both periods and the difference per category", async () => {
    await renderServer(<ComparisonReport currency="USD" data={data} comparison={comparison} />);
    expect(screen.getByTestId("comparison-chart")).toBeTruthy();
    const totals = within(screen.getByLabelText("Oct 2026 compared with Sep 2026"));
    expect(totals.getByText("-$100.00 (-3.2%) vs. Sep 2026")).toBeTruthy();
    expect(totals.getByText("+$100.00 (+10.0%) vs. Sep 2026")).toBeTruthy();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("0.0%")).toBeTruthy();
    expect(within(rows[2]).getByText("New")).toBeTruthy();
    expect(within(rows[3]).getByText("–")).toBeTruthy();
  });

  it("explains an empty comparison and asks for two different periods", async () => {
    const { rerender } = await renderServer(<ComparisonReport currency="USD" data={{ ...data, categories: [] }} comparison={comparison} />);
    expect(screen.getByText("No expenses to compare")).toBeTruthy();
    await rerenderServer(rerender, <ComparisonReport currency="USD" data={{ ...data, type: "income", categories: [] }} comparison={comparison} />);
    expect(screen.getByText("No income to compare")).toBeTruthy();
    await rerenderServer(rerender, <ComparisonReport currency="USD" data={data} comparison={{ ...comparison, b: comparison.a }} />);
    expect(screen.getByText("Choose two different periods")).toBeTruthy();
  });

  it("labels years by their number", async () => {
    const years = parseComparison({ mode: "year", a: "2026", b: "2025" }, "2026-10-08");
    await renderServer(<ComparisonReport currency="USD" data={data} comparison={years} />);
    expect(screen.getByLabelText("2026 compared with 2025")).toBeTruthy();
  });
});

describe("BalanceReport", () => {
  const data: BalanceOverTime = {
    months: ["2026-09-01", "2026-10-01"],
    total: ["1000.00", "1500.00"],
    opening: "900.00",
    change: "600.00",
    accounts: [
      { id: "a", name: "Cash", color: "#9cca56", values: ["400.00", "500.00"] },
      { id: "b", name: "Savings", ownerName: "Ben", color: "#337ab7", values: ["600.00", "1000.00"] },
    ],
  };

  it("shows the total and links to the per-account view", async () => {
    await renderServer(<BalanceReport currency="USD" data={data} split={false} totalHref="/t" accountsHref="/a" />);
    expect(screen.getByTestId("balance-chart")).toBeTruthy();
    expect(screen.getByText("$1,500.00", { selector: "dd" })).toBeTruthy();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("+$100.00")).toBeTruthy();
    expect(within(rows[2]).getByText("+$500.00")).toBeTruthy();
    expect(screen.getByRole("link", { name: "By account" }).getAttribute("href")).toBe("/a");
    expect(screen.getByRole("link", { name: "Total" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("columnheader", { name: "Cash" })).toBeNull();
  });

  it("splits by account with the owner's name, and handles a drop and no accounts", async () => {
    const { rerender } = await renderServer(<BalanceReport currency="USD" data={data} split totalHref="/t" accountsHref="/a" />);
    expect(screen.getByTestId("accounts-chart")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Cash" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Ben · Savings" })).toBeTruthy();
    await rerenderServer(rerender, <BalanceReport currency="USD" data={{ ...data, accounts: [], total: [], months: [] }} split={false} totalHref="/t" accountsHref="/a" />);
    expect(screen.getByText("No accounts to show")).toBeTruthy();
  });
});

describe("ReportFilters", () => {
  const options: ReportFilterOptions = {
    accounts: [{ id: "a", name: "Cash", type: "cash", color: "#9cca56", icon: "banknote", initialBalance: "0.00", isDefault: false, balance: "0.00" }],
    categories: [{ key: "expense:Rent", type: "expense", name: "Rent", color: "#337ab7", icon: "home" }],
    tags: ["Trip"],
    people: [],
  };

  it("offers period shortcuts and highlights the one in use", async () => {
    await renderServer(
      <ReportFilters
        action="/reports/cash-flow"
        filters={{ range: { start: "2026-10-01", end: "2026-10-31" }, tag: "Trip" }}
        options={options}
        fields={{ period: true, details: true }}
        today="2026-10-08"
        linkParams={{ type: "income" }}
        exportHref="/reports/export?report=cash-flow"
      />,
    );
    const thisMonth = screen.getByRole("link", { name: "This month" });
    expect(thisMonth.getAttribute("aria-current")).toBe("true");
    const lastMonth = new URL(screen.getByRole("link", { name: "Last month" }).getAttribute("href")!, "http://x");
    expect(lastMonth.pathname).toBe("/reports/cash-flow");
    expect(Object.fromEntries(lastMonth.searchParams)).toEqual({ from: "2026-09-01", to: "2026-09-30", tag: "Trip", type: "income" });
    expect(screen.getByRole("link", { name: /Export CSV/ }).getAttribute("href")).toBe("/reports/export?report=cash-flow");
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe(
      "/reports/cash-flow?type=income&from=2026-10-01&to=2026-10-31",
    );
    expect(screen.queryByLabelText("Person")).toBeNull();
  });

  it("can hide the date inputs and limit the shortcuts, keeping the period in hidden fields", async () => {
    await renderServer(
      <ReportFilters
        action="/reports/balance"
        filters={{ range: { start: "2026-05-01", end: "2026-10-31" } }}
        options={options}
        fields={{ period: true, dates: false, presets: ["last-6-months", "this-year"] }}
        today="2026-10-08"
        exportHref="/x"
      />,
    );
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.queryByRole("link", { name: "This month" })).toBeNull();
    expect(screen.getByRole("link", { name: "Last 6 months" })).toBeTruthy();
    expect(document.querySelector('input[type="hidden"][name="from"]')?.getAttribute("value")).toBe("2026-05-01");
    expect(document.querySelector('input[type="hidden"][name="to"]')?.getAttribute("value")).toBe("2026-10-31");
  });

  it("hides what a report does not use and offers the person filter in a household", async () => {
    await renderServer(
      <ReportFilters
        action="/reports/balance"
        filters={{ range: { start: "2026-05-01", end: "2026-10-31" } }}
        options={{ ...options, people: [{ id: "p1", name: "Me", isMe: true }, { id: "p2", name: "Ben", isMe: false }] }}
        fields={{}}
        today="2026-10-08"
        keep={{ view: "accounts" }}
        exportHref="/x"
      />,
    );
    expect(screen.queryByRole("group", { name: "Period shortcuts" })).toBeNull();
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.queryByLabelText("Tag")).toBeNull();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    expect(screen.getByLabelText("Person")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Ben" })).toBeTruthy();
    expect(document.querySelector('input[type="hidden"][name="view"]')?.getAttribute("value")).toBe("accounts");
  });
});

describe("ForecastReport", () => {
  const data: ForecastData = {
    hasData: true,
    historyMonths: 6,
    canForecast: true,
    months: [
      { month: "2026-08-01", actual: "1100.00", forecast: null },
      { month: "2026-09-01", actual: "1160.00", forecast: "1160.00" },
      { month: "2026-10-01", actual: null, forecast: "1170.67" },
      { month: "2026-11-01", actual: null, forecast: "1170.67" },
    ],
    categories: [
      { key: "expense:Rent", name: "Rent", color: "#337ab7", icon: "home", last: "1000.00", average: "1000.00", forecast: "1000.00", trend: "stable", change: 0.01 },
      { key: "expense:Groceries", name: "Groceries", color: "#9cca56", icon: "utensils", last: "130.00", average: "113.33", forecast: "147.33", trend: "up", change: 0.3 },
      { key: "expense:Transport", name: "Transport", color: "#ea9150", icon: null, last: "30.00", average: "46.67", forecast: "23.34", trend: "down", change: -0.5 },
    ],
    monthly: "1170.67",
    horizon: "3512.01",
    last: "1160.00",
    average: "1160.00",
    trend: "up",
    change: 0.05,
    yearEnd: { year: "2026", spentSoFar: "7280.00", projected: "10198.71" },
  };

  it("shows the summary, the chart with actual and projected points, and the category table", async () => {
    await renderServer(<ForecastReport currency="USD" data={data} />);
    const summary = within(screen.getByLabelText("Forecast summary"));
    expect(summary.getByText("Projected spending (next 3 months)")).toBeTruthy();
    expect(summary.getByText("$3,512.01")).toBeTruthy();
    expect(summary.getByText("$1,170.67 per month")).toBeTruthy();
    expect(summary.getByText("Year-end projection")).toBeTruthy();
    expect(summary.getByText("$10,198.71")).toBeTruthy();
    expect(summary.getByText("$7,280.00 spent so far in 2026")).toBeTruthy();
    expect(summary.getByText("+5.0%")).toBeTruthy();

    const points = JSON.parse(screen.getByTestId("forecast-chart").getAttribute("data-points")!);
    expect(points).toEqual([
      { label: "Aug 26", actual: 1100, forecast: null },
      { label: "Sep 26", actual: 1160, forecast: 1160 },
      { label: "Oct 26", actual: null, forecast: 1170.67 },
      { label: "Nov 26", actual: null, forecast: 1170.67 },
    ]);

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[2]).getByText("Groceries")).toBeTruthy();
    expect(within(rows[2]).getByText("$130.00")).toBeTruthy();
    expect(within(rows[2]).getByText("$113.33")).toBeTruthy();
    expect(within(rows[2]).getByText("$147.33")).toBeTruthy();
  });

  it("marks each category's trend with an arrow", async () => {
    await renderServer(<ForecastReport currency="USD" data={data} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("stable")).toBeTruthy();
    expect(rows[1].textContent).toContain("→");
    expect(rows[2].textContent).toContain("↑ +30.0%");
    expect(rows[2].textContent).toContain("(Increasing)");
    expect(rows[3].textContent).toContain("↓ -50.0%");
    expect(rows[3].textContent).toContain("(Decreasing)");
  });

  it("says when the data is limited", async () => {
    const { rerender } = await renderServer(<ForecastReport currency="USD" data={data} />);
    expect(screen.queryByRole("status")).toBeNull();
    await rerenderServer(rerender, <ForecastReport currency="USD" data={{ ...data, historyMonths: 3 }} />);
    expect(screen.getByRole("status").textContent).toBe("Based on only 3 months of data, so the forecast is a rough guide.");
  });

  it("shows an empty state without expenses and one for less than two months of history", async () => {
    const { rerender } = await renderServer(<ForecastReport currency="USD" data={{ ...data, hasData: false, months: [], categories: [] }} />);
    expect(screen.getByText("No expenses to forecast")).toBeTruthy();
    expect(screen.queryByTestId("forecast-chart")).toBeNull();
    await rerenderServer(rerender, <ForecastReport currency="USD" data={{ ...data, canForecast: false, historyMonths: 1, yearEnd: null }} />);
    expect(screen.getByText("Need at least 2 months of history to forecast")).toBeTruthy();
    expect(screen.queryByTestId("forecast-chart")).toBeNull();
  });

  it("leaves out the year-end card when there is no projection", async () => {
    await renderServer(<ForecastReport currency="USD" data={{ ...data, yearEnd: null }} />);
    expect(screen.queryByText("Year-end projection")).toBeNull();
  });
});
