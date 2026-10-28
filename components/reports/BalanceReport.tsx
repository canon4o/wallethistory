import Link from "next/link";
import type { CurrencyCode } from "@/lib/currencies";
import type { BalanceOverTime } from "@/lib/data/reports";
import { formatDelta, formatMoney, formatShortMonth } from "@/lib/format";
import { toCents } from "@/lib/reports/money";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccountsBalanceChart, BalanceChart, type BalancePoint } from "./charts";
import { ReportCard, StatCard, tableClass, tdClass, tdRightClass, thClass, thRightClass } from "./ReportCard";
import { getT } from "@/lib/i18n/server";

type Props = {
  data: BalanceOverTime;
  split: boolean;
  /** Where the Total / By account switch points. */
  totalHref: string;
  accountsHref: string;
  currency: CurrencyCode;
};

function accountLabel(account: BalanceOverTime["accounts"][number]): string {
  return account.ownerName ? `${account.ownerName} · ${account.name}` : account.name;
}

export async function BalanceReport({ data, split, totalHref, accountsHref, currency }: Props) {
  const t = await getT();
  if (data.accounts.length === 0) {
    return <EmptyState title={t("No accounts to show")} description={t("There is no account for these filters.")} />;
  }
  const last = data.total.at(-1) ?? data.opening;
  const lines = data.accounts.map((account, index) => ({ key: `account${index}`, name: accountLabel(account), color: account.color }));
  const points: BalancePoint[] = data.months.map((month, index) => {
    const point: BalancePoint = { label: formatShortMonth(month, t), total: Number(data.total[index]) };
    data.accounts.forEach((account, accountIndex) => {
      point[`account${accountIndex}`] = Number(account.values[index]);
    });
    return point;
  });

  const tab = (active: boolean) =>
    `inline-flex min-h-10 items-center rounded px-3 focus-visible:outline-2 focus-visible:outline-primary-strong ${
      active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted hover:bg-background"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <dl aria-label={t("Balance summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-2">
        <StatCard label={t("Balance at the end of the period")} value={formatMoney(Number(last), currency)} tone="accounts" />
        <StatCard label={t("Balance before the period")} value={formatMoney(Number(data.opening), currency)} />
      </dl>
      <ReportCard
        title={t("Balance over time")}
        description={t("Money at the end of each month: initial balances plus income, minus expenses, with transfers.")}
      >
        <nav aria-label={t("Balance view")} className="inline-flex self-start rounded-md border border-border bg-surface p-0.5 text-sm font-semibold">
          <Link href={totalHref} aria-current={split ? undefined : "page"} className={tab(!split)}>
            {t("Total")}
          </Link>
          <Link href={accountsHref} aria-current={split ? "page" : undefined} className={tab(split)}>
            {t("By account")}
          </Link>
        </nav>
        {split ? <AccountsBalanceChart data={points} lines={lines} /> : <BalanceChart data={points} />}
      </ReportCard>
      <ReportCard title={t("Month by month")}>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <caption className="sr-only">{t("Balance at the end of each month")}</caption>
            <thead>
              <tr>
                <th scope="col" className={thClass}>{t("Month")}</th>
                {split
                  ? data.accounts.map((account) => (
                      <th key={account.id} scope="col" className={thRightClass}>
                        {accountLabel(account)}
                      </th>
                    ))
                  : null}
                <th scope="col" className={thRightClass}>{t("Total")}</th>
                <th scope="col" className={thRightClass}>{t("Change over the period")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.months.map((month, index) => {
                const change = (toCents(data.total[index]) - toCents(index === 0 ? data.opening : data.total[index - 1])) / 100;
                return (
                <tr key={month}>
                  <th scope="row" className={`${tdClass} text-left font-semibold`}>{formatShortMonth(month, t)}</th>
                  {split
                    ? data.accounts.map((account) => (
                        <td key={account.id} className={tdRightClass}>
                          {formatMoney(Number(account.values[index]), currency)}
                        </td>
                      ))
                    : null}
                  <td className={`${tdRightClass} font-semibold`}>{formatMoney(Number(data.total[index]), currency)}</td>
                  <td className={`${tdRightClass} ${change < 0 ? "text-expense-text" : "text-income-text"}`}>{formatDelta(change, currency)}</td>
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
