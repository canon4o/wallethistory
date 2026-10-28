// Turns each report's data into CSV rows: the same numbers the report shows on screen.

import type { BalanceOverTime, CashFlow, ForecastData, PeriodComparison, SpendingByCategory } from "@/lib/data/reports";
import { formatMonthYear } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";
import type { Comparison } from "@/lib/validation/reports";
import type { CsvCell } from "./csv";
import { changeRatio, toCents } from "./money";

/** "Oct 2026" for a month key (`2026-10`), the year itself for a year key. */
export function comparisonLabel(mode: Comparison["mode"], key: string, t?: Translate): string {
  return mode === "month" ? formatMonthYear(`${key}-01`, t) : key;
}

const money = (amount: string) => Number(amount);
const percent = (ratio: number | null): CsvCell => (ratio === null ? null : ratio * 100);

export function cashFlowRows(data: CashFlow): CsvCell[][] {
  return [
    ["Month", "Income", "Expenses", "Net"],
    ...data.months.map((month): CsvCell[] => [month.month.slice(0, 7), money(month.income), money(month.expense), money(month.net)]),
    ["Total", money(data.income), money(data.expense), money(data.net)],
    ["Savings rate (%)", percent(data.savingsRate)],
  ];
}

export function spendingRows(data: SpendingByCategory): CsvCell[][] {
  return [
    ["Category", "Amount", "Share of total (%)", "Previous period", "Change (%)"],
    ...data.rows.map((row): CsvCell[] => [row.name, money(row.a), row.share * 100, money(row.b), percent(row.change)]),
    ["Total", money(data.totalA), 100, money(data.totalB), percent(changeRatio(toCents(data.totalA), toCents(data.totalB)))],
  ];
}

export function comparisonRows(data: PeriodComparison, aLabel: string, bLabel: string): CsvCell[][] {
  const total = (label: string, totals: { a: string; b: string }): CsvCell[] => [
    label,
    money(totals.a),
    money(totals.b),
    (toCents(totals.a) - toCents(totals.b)) / 100,
    percent(changeRatio(toCents(totals.a), toCents(totals.b))),
  ];
  return [
    ["", aLabel, bLabel, "Difference", "Change (%)"],
    total("Income", data.income),
    total("Expenses", data.expense),
    total("Net", data.net),
    [],
    [data.type === "expense" ? "Expense category" : "Income category", aLabel, bLabel, "Difference", "Change (%)"],
    ...data.categories.map((row): CsvCell[] => [row.name, money(row.a), money(row.b), money(row.delta), percent(row.change)]),
  ];
}

export function balanceRows(data: BalanceOverTime): CsvCell[][] {
  const names = data.accounts.map((account) => (account.ownerName ? `${account.ownerName} · ${account.name}` : account.name));
  return [
    ["Month", ...names, "Total"],
    ...data.months.map((month, index): CsvCell[] => [
      month.slice(0, 7),
      ...data.accounts.map((account) => money(account.values[index])),
      money(data.total[index]),
    ]),
  ];
}

export function forecastRows(data: ForecastData): CsvCell[][] {
  return [
    ["Category", "Last month", "Average", "Projected per month", "Trend", "Change (%)"],
    ...data.categories.map((row): CsvCell[] => [row.name, money(row.last), money(row.average), money(row.forecast), row.trend, percent(row.change)]),
    ["Total", money(data.last), money(data.average), money(data.monthly), data.trend, percent(data.change)],
  ];
}
