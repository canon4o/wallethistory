import type { CurrencyCode } from "@/lib/currencies";
import type { PeriodComparison } from "@/lib/data/reports";
import { formatDelta, formatMoney, formatPercentChange } from "@/lib/format";
import { comparisonLabel } from "@/lib/reports/export";
import { changeRatio, toCents } from "@/lib/reports/money";
import type { Comparison } from "@/lib/validation/reports";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { ComparisonChart } from "./charts";
import { ReportCard, tableClass, tdClass, tdRightClass, thClass, thRightClass } from "./ReportCard";
import { getT } from "@/lib/i18n/server";

const CHART_CATEGORIES = 8;

async function TotalCard({
  label,
  totals,
  higherIsBetter,
  aLabel,
  bLabel,
  currency,
}: {
  label: string;
  totals: { a: string; b: string };
  higherIsBetter: boolean;
  aLabel: string;
  bLabel: string;
  currency: CurrencyCode;
}) {
  const t = await getT();
  const delta = toCents(totals.a) - toCents(totals.b);
  const tone = delta === 0 ? "text-muted" : delta > 0 === higherIsBetter ? "text-income-text" : "text-expense-text";
  const change = changeRatio(toCents(totals.a), toCents(totals.b));
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{formatMoney(Number(totals.a), currency)}</dd>
      <dd className="text-xs text-muted">
        {bLabel}: {formatMoney(Number(totals.b), currency)}
      </dd>
      <dd className={`text-xs font-semibold tabular-nums ${tone}`}>
        {formatDelta(delta / 100, currency)}
        {change === null ? "" : ` (${formatPercentChange(change)})`} {t("vs. {period}", { period: bLabel })}
        <span className="sr-only"> ({t("{a} compared with {b}", { a: aLabel, b: bLabel })})</span>
      </dd>
    </div>
  );
}

export async function ComparisonReport({
  data,
  comparison,
  currency,
}: {
  data: PeriodComparison;
  comparison: Comparison;
  currency: CurrencyCode;
}) {
  const t = await getT();
  const aLabel = comparisonLabel(comparison.mode, comparison.a, t);
  const bLabel = comparisonLabel(comparison.mode, comparison.b, t);
  const expense = data.type === "expense";

  if (comparison.a === comparison.b) {
    return <EmptyState title={t("Choose two different periods")} description={t("Both periods are the same, so there is nothing to compare.")} />;
  }

  const empty = data.categories.length === 0;
  const worse = data.type === "expense" ? "text-expense-text" : "text-income-text";
  const better = data.type === "expense" ? "text-income-text" : "text-expense-text";

  return (
    <div className="flex flex-col gap-4">
      <dl aria-label={t("{a} compared with {b}", { a: aLabel, b: bLabel })} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TotalCard label={t("Income")} totals={data.income} higherIsBetter aLabel={aLabel} bLabel={bLabel} currency={currency} />
        <TotalCard label={t("Expenses")} totals={data.expense} higherIsBetter={false} aLabel={aLabel} bLabel={bLabel} currency={currency} />
        <TotalCard label={t("Net")} totals={data.net} higherIsBetter aLabel={aLabel} bLabel={bLabel} currency={currency} />
      </dl>
      {empty ? (
        <EmptyState
          title={expense ? t("No expenses to compare") : t("No income to compare")}
          description={t("Nothing matches these filters in either period. Clear the filters or choose other periods.")}
        />
      ) : (
        <>
          <ReportCard
            title={t("{a} vs. {b}", { a: aLabel, b: bLabel })}
            description={expense ? t("The largest expense categories, side by side.") : t("The largest income categories, side by side.")}
          >
            <ComparisonChart
              aLabel={aLabel}
              bLabel={bLabel}
              data={[...data.categories]
                .sort((x, y) => toCents(y.a) + toCents(y.b) - (toCents(x.a) + toCents(x.b)))
                .slice(0, CHART_CATEGORIES)
                .map((row) => ({ name: row.name, a: Number(row.a), b: Number(row.b) }))}
            />
          </ReportCard>
          <ReportCard title={t("Difference per category")} description={t("{a} compared with {b}.", { a: aLabel, b: bLabel })}>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <caption className="sr-only">{t("Amount per category in both periods and the difference")}</caption>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>{t("Category")}</th>
                    <th scope="col" className={thRightClass}>{aLabel}</th>
                    <th scope="col" className={thRightClass}>{bLabel}</th>
                    <th scope="col" className={thRightClass}>{t("Difference")}</th>
                    <th scope="col" className={thRightClass}>{t("Change")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.categories.map((row) => {
                    const delta = Number(row.delta);
                    const tone = delta > 0 ? worse : delta < 0 ? better : "text-muted";
                    return (
                      <tr key={row.key ?? "uncategorized"}>
                        <th scope="row" className={`${tdClass} text-left font-normal`}>
                          <span className="flex items-center gap-2">
                            {row.icon ? (
                              <CategoryBadge icon={row.icon} color={row.color} />
                            ) : (
                              <span aria-hidden="true" className="size-6 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                            )}
                            <span className="font-semibold">{row.name}</span>
                          </span>
                        </th>
                        <td className={tdRightClass}>{formatMoney(Number(row.a), currency)}</td>
                        <td className={tdRightClass}>{formatMoney(Number(row.b), currency)}</td>
                        <td className={`${tdRightClass} font-semibold ${tone}`}>{formatDelta(delta, currency)}</td>
                        <td className={`${tdRightClass} ${tone}`}>
                          {row.change === null ? (Number(row.b) === 0 && Number(row.a) > 0 ? t("New") : "–") : formatPercentChange(row.change)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ReportCard>
        </>
      )}
    </div>
  );
}
