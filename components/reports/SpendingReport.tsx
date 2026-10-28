import Link from "next/link";
import type { SpendingByCategory } from "@/lib/data/reports";
import type { CurrencyCode } from "@/lib/currencies";
import { formatDelta, formatMoney, formatMonthYear, formatPercent, formatPercentChange, formatDate } from "@/lib/format";
import { wholeMonths } from "@/lib/reports/periods";
import { filtersToSearchParams } from "@/lib/validation/transactions";
import type { ReportFilters } from "@/lib/validation/reports";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { SpendingDonut } from "./charts";
import { ReportCard, tableClass, tdClass, tdRightClass, thClass, thRightClass } from "./ReportCard";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";

/** "2026-09" for a single month, otherwise "2026-07-01 to 2026-09-30". */
function periodLabel(range: { start: string; end: string }, t: Translate): string {
  return wholeMonths(range) === 1
    ? formatMonthYear(range.start, t)
    : t("{start} to {end}", { start: formatDate(range.start, t), end: formatDate(range.end, t) });
}

/** The transactions behind a category row, with the same period and filters. */
function transactionsHref(categoryKey: string, filters: ReportFilters): string {
  const params = filtersToSearchParams({
    from: filters.range.start,
    to: filters.range.end,
    category: categoryKey,
    accountId: filters.accountId,
    personId: filters.personId,
    tag: filters.tag,
    q: filters.q,
    page: 1,
  });
  return `/transactions?${params.toString()}`;
}

export async function SpendingReport({
  data,
  filters,
  currency,
}: {
  data: SpendingByCategory;
  filters: ReportFilters;
  currency: CurrencyCode;
}) {
  const t = await getT();
  const expense = data.type === "expense";
  if (data.rows.length === 0) {
    return (
      <EmptyState
        title={expense ? t("No expenses to report") : t("No income to report")}
        description={t("Nothing matches these filters in this period. Try a longer period or clear the filters.")}
      />
    );
  }
  // More spending is bad news, more income is good news.
  const worse = data.type === "expense" ? "text-expense-text" : "text-income-text";
  const better = data.type === "expense" ? "text-income-text" : "text-expense-text";
  const total = Number(data.totalA);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <ReportCard title={data.type === "expense" ? t("Where the money went") : t("Where the money came from")}>
        <div className="relative">
          <SpendingDonut
            label={
              expense
                ? t("Share of expenses per category. The same numbers are in the table.")
                : t("Share of income per category. The same numbers are in the table.")
            }
            data={data.rows.map((row) => ({ name: row.name, value: Number(row.a), color: row.color }))}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted">{t("Total")}</span>
            <span className="text-lg font-bold tabular-nums">{formatMoney(total, currency)}</span>
          </div>
        </div>
      </ReportCard>
      <ReportCard title={t("Categories")} description={t("Change compares with {period}.", { period: periodLabel(data.previous, t) })}>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <caption className="sr-only">{t("Categories ranked by amount, with share of total and change")}</caption>
            <thead>
              <tr>
                <th scope="col" className={thClass}>{t("Category")}</th>
                <th scope="col" className={thRightClass}>{t("Amount")}</th>
                <th scope="col" className={thRightClass}>{t("% of total")}</th>
                <th scope="col" className={thRightClass}>{t("Change")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((row) => {
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
                        {row.key ? (
                          <Link
                            href={transactionsHref(row.key, filters)}
                            className="font-semibold text-primary-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{row.name}</span>
                        )}
                      </span>
                    </th>
                    <td className={`${tdRightClass} font-semibold`}>{formatMoney(Number(row.a), currency)}</td>
                    <td className={tdRightClass}>{formatPercent(row.share)}</td>
                    <td className={`${tdRightClass} ${tone}`}>
                      {row.change === null ? (
                        Number(row.b) === 0 ? t("New") : "–"
                      ) : (
                        <>
                          {formatPercentChange(row.change)}
                          <span className="block text-xs">{formatDelta(delta, currency)}</span>
                        </>
                      )}
                    </td>
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
