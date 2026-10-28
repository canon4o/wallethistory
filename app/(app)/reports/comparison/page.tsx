import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { ComparisonPeriodFields } from "@/components/reports/ComparisonPeriodFields";
import { ComparisonReport } from "@/components/reports/ComparisonReport";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { exportHref } from "@/components/reports/report-nav";
import { Select } from "@/components/ui/Select";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { addMonths } from "@/lib/reports/periods";
import { getPeriodComparison, getReportFilterOptions } from "@/lib/data/reports";
import {
  parseComparison,
  parseReportFilters,
  parseReportType,
  reportFiltersToSearchParams,
} from "@/lib/validation/reports";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Period comparison") };
}

const YEAR_CHOICES = 10;

export default async function ComparisonPage({ searchParams }: PageProps<"/reports/comparison">) {
  const t = await getT();
  const params = await searchParams;
  const user = await requireUser();
  const today = todayISO(user.timezone);
  // The two compared periods replace the period filter; the other filters still apply.
  const filters = parseReportFilters(params, "this-month", today);
  const comparison = parseComparison(params, today);
  const type = parseReportType(params);
  const [data, options] = await Promise.all([getPeriodComparison(filters, comparison, type), getReportFilterOptions()]);

  const exportParams = reportFiltersToSearchParams(filters);
  exportParams.delete("from");
  exportParams.delete("to");
  for (const [key, value] of Object.entries({ mode: comparison.mode, a: comparison.a, b: comparison.b, type })) {
    exportParams.set(key, value);
  }
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: YEAR_CHOICES }, (_, index) => String(thisYear - index));
  for (const key of [comparison.a, comparison.b]) if (comparison.mode === "year" && !years.includes(key)) years.push(key);

  return (
    <>
      <PageHeader title={t("Reports")} />
      <ReportFilters
        action="/reports/comparison"
        filters={filters}
        options={options}
        fields={{ details: true }}
        today={today}
        linkParams={{ mode: comparison.mode, a: comparison.a, b: comparison.b, type }}
        exportHref={exportHref("comparison", exportParams)}
      >
        <ComparisonPeriodFields
          mode={comparison.mode}
          a={comparison.a}
          b={comparison.b}
          years={years}
          defaults={{
            month: { a: today.slice(0, 7), b: addMonths(today, -1).slice(0, 7) },
            year: { a: String(thisYear), b: String(thisYear - 1) },
          }}
        />
        <Select id="report-type" name="type" label={t("Categories")} defaultValue={type}>
          <option value="expense">{t("Expenses")}</option>
          <option value="income">{t("Income")}</option>
        </Select>
      </ReportFilters>
      <ComparisonReport currency={user.currency} data={data} comparison={comparison} />
    </>
  );
}
