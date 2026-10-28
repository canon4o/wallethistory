import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { exportHref } from "@/components/reports/report-nav";
import { SpendingReport } from "@/components/reports/SpendingReport";
import { Select } from "@/components/ui/Select";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { getReportFilterOptions, getSpendingByCategory } from "@/lib/data/reports";
import {
  parseReportFilters,
  parseReportType,
  reportFiltersToSearchParams,
} from "@/lib/validation/reports";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Spending by category") };
}

export default async function SpendingPage({ searchParams }: PageProps<"/reports/spending">) {
  const t = await getT();
  const params = await searchParams;
  const user = await requireUser();
  const today = todayISO(user.timezone);
  const filters = parseReportFilters(params, "this-month", today);
  const type = parseReportType(params);
  const [data, options] = await Promise.all([getSpendingByCategory(filters, type), getReportFilterOptions()]);
  const exportParams = reportFiltersToSearchParams(filters);
  exportParams.set("type", type);
  return (
    <>
      <PageHeader title={t("Reports")} />
      <ReportFilters
        action="/reports/spending"
        filters={filters}
        options={options}
        fields={{ period: true, details: true }}
        today={today}
        linkParams={{ type }}
        exportHref={exportHref("spending", exportParams)}
      >
        <Select id="report-type" name="type" label={t("Show")} defaultValue={type}>
          <option value="expense">{t("Expenses")}</option>
          <option value="income">{t("Income")}</option>
        </Select>
      </ReportFilters>
      <SpendingReport data={data} currency={user.currency} filters={filters} />
    </>
  );
}
