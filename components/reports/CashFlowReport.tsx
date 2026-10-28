import type { CashFlow } from "@/lib/data/reports";
import type { CurrencyCode } from "@/lib/currencies";
import { savingsRate, toCents } from "@/lib/reports/money";
import { formatMoney, formatPercent, formatShortMonth } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { CashFlowChart } from "./charts";
import { ReportCard, StatCard, tableClass, tdClass, tdRightClass, thClass, thRightClass } from "./ReportCard";
import { getT } from "@/lib/i18n/server";

export async function CashFlowReport({ data, currency }: { data: CashFlow; currency: CurrencyCode }) {
  const t = await getT();
  if (!data.hasData) {
    return (
      <EmptyState
        title={t("No transactions to report")}
        description={t("Nothing matches these filters in this period. Try a longer period or clear the filters.")}
      />
    );
  }
  const net = Number(data.net);
  return (
    <div className="flex flex-col gap-4">
      <dl aria-label={t("Totals for the period")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("Income")} value={formatMoney(Number(data.income), currency)} tone="income" />
        <StatCard label={t("Expenses")} value={formatMoney(Number(data.expense), currency)} tone="expense" />
        <StatCard label={t("Net")} value={formatMoney(net, currency)} tone={net < 0 ? "expense" : "income"} />
        <StatCard
          label={t("Savings rate")}
          value={data.savingsRate === null ? "n/a" : formatPercent(data.savingsRate)}
          hint={data.savingsRate === null ? t("No income in this period") : t("Share of income not spent")}
        />
      </dl>
      <ReportCard title={t("Income vs. expenses")} description={t("Per month, with the net as a line. Transfers between accounts are not counted.")}>
        <CashFlowChart
          data={data.months.map((month) => ({
            label: formatShortMonth(month.month, t),
            income: Number(month.income),
            expense: Number(month.expense),
            net: Number(month.net),
          }))}
        />
      </ReportCard>
      <ReportCard title={t("Month by month")}>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <caption className="sr-only">{t("Income, expenses, net and savings rate per month")}</caption>
            <thead>
              <tr>
                <th scope="col" className={thClass}>{t("Month")}</th>
                <th scope="col" className={thRightClass}>{t("Income")}</th>
                <th scope="col" className={thRightClass}>{t("Expenses")}</th>
                <th scope="col" className={thRightClass}>{t("Net")}</th>
                <th scope="col" className={thRightClass}>{t("Savings rate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.months.map((month) => {
                const rate = savingsRate(toCents(month.income), toCents(month.expense));
                return (
                <tr key={month.month}>
                  <th scope="row" className={`${tdClass} text-left font-semibold`}>{formatShortMonth(month.month, t)}</th>
                  <td className={`${tdRightClass} text-income-text`}>{formatMoney(Number(month.income), currency)}</td>
                  <td className={`${tdRightClass} text-expense-text`}>{formatMoney(Number(month.expense), currency)}</td>
                  <td className={`${tdRightClass} font-semibold`}>{formatMoney(Number(month.net), currency)}</td>
                  <td className={tdRightClass}>{rate === null ? "n/a" : formatPercent(rate)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ReportCard>
    </div>
  );
}
