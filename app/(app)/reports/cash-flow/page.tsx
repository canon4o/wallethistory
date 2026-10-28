import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { CashFlowReport } from "@/components/reports/CashFlowReport";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { exportHref } from "@/components/reports/report-nav";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { getCashFlow, getReportFilterOptions } from "@/lib/data/reports";
import { parseReportFilters, reportFiltersToSearchParams } from "@/lib/validation/reports";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Cash flow") };
}

export default async function CashFlowPage({ searchParams }: PageProps<"/reports/cash-flow">) {
  const t = await getT();
  const user = await requireUser();
  const today = todayISO(user.timezone);
  const filters = parseReportFilters(await searchParams, "last-6-months", today);
  const [data, options] = await Promise.all([getCashFlow(filters), getReportFilterOptions()]);
  return (
    <>
      <PageHeader title={t("Reports")} />
      <ReportFilters
        action="/reports/cash-flow"
        filters={filters}
        options={options}
        fields={{ period: true, dates: false, details: true }}
        today={today}
        exportHref={exportHref("cash-flow", reportFiltersToSearchParams(filters))}
      />
      <CashFlowReport data={data} currency={user.currency} />
    </>
  );
}
