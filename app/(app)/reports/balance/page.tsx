import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { BalanceReport } from "@/components/reports/BalanceReport";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { exportHref } from "@/components/reports/report-nav";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { getBalanceOverTime, getReportFilterOptions } from "@/lib/data/reports";
import { parseReportFilters, reportFiltersToSearchParams } from "@/lib/validation/reports";
import { getT } from "@/lib/i18n/server";

const BALANCE_PRESETS = ["last-6-months", "last-12-months", "this-year", "last-year"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Balance over time") };
}

export default async function BalancePage({ searchParams }: PageProps<"/reports/balance">) {
  const t = await getT();
  const params = await searchParams;
  const user = await requireUser();
  const today = todayISO(user.timezone);
  const filters = parseReportFilters(params, "last-12-months", today);
  const split = params.view === "accounts";
  const [data, options] = await Promise.all([getBalanceOverTime(filters), getReportFilterOptions()]);

  // Category, tag and note filters don't apply to a balance, so the link drops them.
  const viewParams = (view?: string) => {
    const query = reportFiltersToSearchParams({ range: filters.range, accountId: filters.accountId, personId: filters.personId });
    if (view) query.set("view", view);
    return `/reports/balance?${query.toString()}`;
  };

  return (
    <>
      <PageHeader title={t("Reports")} />
      <ReportFilters
        action="/reports/balance"
        filters={{ range: filters.range, accountId: filters.accountId, personId: filters.personId }}
        options={options}
        fields={{ period: true, dates: false, presets: BALANCE_PRESETS }}
        today={today}
        keep={split ? { view: "accounts" } : {}}
        exportHref={exportHref(
          "balance",
          reportFiltersToSearchParams({ range: filters.range, accountId: filters.accountId, personId: filters.personId }),
        )}
      />
      <BalanceReport data={data} currency={user.currency} split={split} totalHref={viewParams()} accountsHref={viewParams("accounts")} />
    </>
  );
}
