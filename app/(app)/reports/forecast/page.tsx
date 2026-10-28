import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { ForecastReport } from "@/components/reports/ForecastReport";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { exportHref } from "@/components/reports/report-nav";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { getForecastData, getReportFilterOptions } from "@/lib/data/reports";
import { forecastRange } from "@/lib/reports/forecast";
import { parseReportFilters, reportFiltersToSearchParams } from "@/lib/validation/reports";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Forecast Report") };
}

export default async function ForecastPage({ searchParams }: PageProps<"/reports/forecast">) {
  const t = await getT();
  const params = await searchParams;
  const user = await requireUser();
  const today = todayISO(user.timezone);
  // The period is fixed (last 6 months); only the narrowing filters come from the URL.
  const filters = { ...parseReportFilters(params, "last-6-months", today), range: forecastRange(today) };
  const [data, options] = await Promise.all([getForecastData(filters, today), getReportFilterOptions()]);
  return (
    <>
      <PageHeader title={t("Reports")} />
      <ReportFilters
        action="/reports/forecast"
        filters={filters}
        // Only expense categories are forecast.
        options={{ ...options, categories: options.categories.filter((category) => category.type === "expense") }}
        fields={{ details: true }}
        today={today}
        exportHref={exportHref("forecast", reportFiltersToSearchParams(filters))}
      />
      <ForecastReport data={data} currency={user.currency} />
    </>
  );
}
