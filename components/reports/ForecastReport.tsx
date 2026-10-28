import type { ForecastData } from "@/lib/data/reports";
import type { CurrencyCode } from "@/lib/currencies";
import { formatMoney, formatMonthYear, formatPercentChange, formatShortMonth } from "@/lib/format";
import { FORECAST_MONTHS, LIMITED_HISTORY_MONTHS } from "@/lib/reports/forecast";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForecastChart } from "./charts";
import { ReportCard, StatCard, tableClass, tdClass, tdRightClass, thClass, thRightClass } from "./ReportCard";
import { getT } from "@/lib/i18n/server";

const GLYPHS = { up: "↑", down: "↓", stable: "→" } as const;
// Spending that goes up is bad news, spending that goes down is good news.
const TONES = { up: "text-expense-text", down: "text-income-text", stable: "text-muted" } as const;

async function TrendLabel({ trend, change }: { trend: ForecastData["trend"]; change: number | null }) {
  const t = await getT();
  const name = trend === "up" ? t("Increasing") : trend === "down" ? t("Decreasing") : t("Stable");
  const detail = trend === "stable" ? t("stable") : change === null ? t("new") : formatPercentChange(change);
  return (
    <span className={`font-semibold ${TONES[trend]}`}>
      <span aria-hidden="true">{GLYPHS[trend]}</span> {detail}
      <span className="sr-only"> ({name})</span>
    </span>
  );
}

export async function ForecastReport({ data, currency }: { data: ForecastData; currency: CurrencyCode }) {
  const t = await getT();
  if (!data.hasData) {
    return (
      <EmptyState
        title={t("No expenses to forecast")}
        description={t("Nothing matches these filters in the complete months of this period. Try a longer period or clear the filters.")}
      />
    );
  }
  if (!data.canForecast) {
    return (
      <EmptyState
        title={t("Need at least 2 months of history to forecast")}
        description={t("Only complete months count. Choose a period of at least two full months that has already ended.")}
      />
    );
  }

  const money = (amount: string) => formatMoney(Number(amount), currency);
  const firstAhead = data.months.find((month) => month.actual === null);
  return (
    <div className="flex flex-col gap-4">
      <dl aria-label={t("Forecast summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("Projected spending (next {count} months)", { count: FORECAST_MONTHS })}
          value={money(data.horizon)}
          hint={t("{amount} per month", { amount: money(data.monthly) })}
        />
        {data.yearEnd ? (
          <StatCard
            label={t("Year-end projection")}
            value={money(data.yearEnd.projected)}
            hint={t("{amount} spent so far in {year}", { amount: money(data.yearEnd.spentSoFar), year: data.yearEnd.year })}
          />
        ) : null}
        <StatCard label={t("Average per month")} value={money(data.average)} hint={t("Last month: {amount}", { amount: money(data.last) })} />
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs text-muted">{t("Trend")}</dt>
          <dd className="text-xl font-bold tabular-nums">
            <TrendLabel trend={data.trend} change={data.change} />
          </dd>
          <dd className="text-xs text-muted">{t("Recent months vs. earlier months")}</dd>
        </div>
      </dl>
      <ReportCard
        title={t("Actual vs. projected")}
        description={t("Spending per month so far, and the projection from {month} on.", {
          month: firstAhead ? formatMonthYear(firstAhead.month, t) : "",
        })}
      >
        {data.historyMonths < LIMITED_HISTORY_MONTHS ? (
          <p role="status" className="text-xs text-muted">
            {t("Based on only {count} months of data, so the forecast is a rough guide.", { count: data.historyMonths })}
          </p>
        ) : null}
        <ForecastChart
          data={data.months.map((month) => ({
            label: formatShortMonth(month.month, t),
            actual: month.actual === null ? null : Number(month.actual),
            forecast: month.forecast === null ? null : Number(month.forecast),
          }))}
        />
      </ReportCard>
      <ReportCard title={t("By category")} description={t("Projected amounts are per month.")}>
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <caption className="sr-only">{t("Last month, average, projection and trend per expense category")}</caption>
            <thead>
              <tr>
                <th scope="col" className={thClass}>{t("Category")}</th>
                <th scope="col" className={thRightClass}>{t("Last month")}</th>
                <th scope="col" className={thRightClass}>{t("Average")}</th>
                <th scope="col" className={thRightClass}>{t("Projected")}</th>
                <th scope="col" className={thRightClass}>{t("Trend")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.categories.map((row) => (
                <tr key={row.key ?? "uncategorized"}>
                  <th scope="row" className={`${tdClass} text-left font-semibold`}>
                    <span className="flex items-center gap-2">
                      {row.icon ? (
                        <CategoryBadge icon={row.icon} color={row.color} />
                      ) : (
                        <span aria-hidden="true" className="size-6 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                      )}
                      {row.name}
                    </span>
                  </th>
                  <td className={tdRightClass}>{money(row.last)}</td>
                  <td className={tdRightClass}>{money(row.average)}</td>
                  <td className={`${tdRightClass} font-semibold`}>{money(row.forecast)}</td>
                  <td className={tdRightClass}>
                    <TrendLabel trend={row.trend} change={row.change} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>
    </div>
  );
}
