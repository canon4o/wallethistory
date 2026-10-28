import Link from "next/link";
import type { ReactNode } from "react";
import { AccountBadge } from "@/components/accounts/AccountIcon";
import { ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import { accountLabel } from "@/lib/account-label";
import type { CurrencyCode } from "@/lib/currencies";
import type { Dashboard } from "@/lib/data/dashboard";
import { formatDate, formatDelta, formatMoney, formatDayRange, formatMonth, formatPercent, formatPercentChange, formatShortMonth } from "@/lib/format";
import { fromCents, toCents } from "@/lib/reports/money";
import { UNCATEGORIZED_COLOR } from "@/lib/reports/constants";
import { Amount } from "@/components/transactions/Amount";
import { TransferBadge } from "@/components/transactions/TransferBadge";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "./Sparkline";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { CashFlowChart, SpendingDonut } from "@/components/reports/charts";
import { KindIcon } from "@/components/recurring/RecurringManager";
import { describeRule, describeSchedule } from "@/lib/recurring/labels";
import { goalProgress } from "@/lib/goals/progress";
import { getT } from "@/lib/i18n/server";

const linkClass =
  "inline-flex min-h-10 items-center font-semibold text-primary-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong";

type Tone = "income" | "expense" | "accounts";

const TONE_TEXT: Record<Tone, string> = { income: "text-income-text", expense: "text-expense-text", accounts: "text-accounts" };
// The sparkline uses the strong token on light surfaces; the lighter domain color is too faint as a thin line.
const TONE_LINE: Record<Tone, string> = { income: "text-income", expense: "text-expense", accounts: "text-accounts" };

/** "+$40.00 (+1.2%)" for a change; the percentage is left out when there is nothing to compare with. */
function changeText(delta: number, base: number, currency: CurrencyCode): string {
  const percent = base > 0 ? ` (${formatPercentChange(delta / base)})` : "";
  return `${formatDelta(delta, currency)}${percent}`;
}

/** One summary tile: the value, how it changed, and a small trend line. */
function Stat({
  label,
  value,
  tone,
  change,
  note,
  trend,
  trendLabel,
}: {
  label: string;
  value: string;
  tone?: Tone;
  /** A line under the value saying how it changed, colored good or bad. */
  change?: { text: string; good: boolean | null; against?: string };
  note?: string;
  trend?: number[];
  trendLabel: string;
}) {
  const changeColor = change?.good === true ? "text-income-text" : change?.good === false ? "text-expense-text" : "text-muted";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums ${tone ? TONE_TEXT[tone] : ""}`}>{value}</dd>
      {change ? (
        <dd className={`text-xs font-semibold tabular-nums ${changeColor}`}>
          {change.text}
          {change.against ? <span className="whitespace-nowrap"> {change.against}</span> : null}
        </dd>
      ) : null}
      {trend ? (
        <dd>
          <Sparkline values={trend} label={trendLabel} className={tone ? TONE_LINE[tone] : "text-primary"} />
        </dd>
      ) : null}
      {note ? <dd className="text-xs font-semibold">{note}</dd> : null}
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `card-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex min-h-10 items-center justify-between gap-2">
        <h2 id={id} className="text-sm font-bold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

const SPENDING_LEGEND_ROWS = 4;

/** The biggest categories, with everything after them added up as "Other". */
function topCategories(rows: Dashboard["spending"]["rows"], otherLabel: string) {
  const top = rows.slice(0, SPENDING_LEGEND_ROWS).map((row) => ({ name: row.name, color: row.color, amount: row.a, share: row.share }));
  const rest = rows.slice(SPENDING_LEGEND_ROWS);
  if (rest.length === 0) return top;
  const amount = rest.reduce((sum, row) => sum + toCents(row.a), 0);
  return [
    ...top,
    { name: otherLabel, color: UNCATEGORIZED_COLOR, amount: fromCents(amount), share: rest.reduce((sum, row) => sum + row.share, 0) },
  ];
}

/** The whole dashboard from already-loaded data. Charts come from the reports; the rest is HTML and CSS. */
export async function DashboardView({ data, currency, today }: { data: Dashboard; currency: CurrencyCode; today: string }) {
  const t = await getT();
  const net = Number(data.net);
  const balanceChange = Number(data.balanceChange);
  const lastRange = formatDayRange(data.lastMonthToDate.range.start, data.lastMonthToDate.range.end, t);
  /** This month so far against the same days of last month; `higherIsBetter` decides which way is green. */
  const compare = (now: number, before: number, higherIsBetter: boolean) => {
    const delta = now - before;
    return {
      text: changeText(delta, Math.abs(before), currency),
      against: t("vs. {range}", { range: lastRange }),
      good: delta === 0 ? null : delta > 0 === higherIsBetter,
    };
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{formatMonth(data.month.start, t)}</p>
        {data.inHousehold ? (
          <nav aria-label={t("Dashboard view")} className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm font-semibold">
            {(["household", "mine"] as const).map((scope) => (
              <Link
                key={scope}
                href={scope === "household" ? "/dashboard" : "/dashboard?scope=mine"}
                aria-current={data.scope === scope ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded px-3 focus-visible:outline-2 focus-visible:outline-primary-strong ${
                  data.scope === scope ? "bg-primary-soft text-primary-soft-foreground" : "text-muted hover:bg-background"
                }`}
              >
                {scope === "household" ? t("Household") : t("Mine")}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <dl aria-label={t("Summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("Total balance")}
          value={formatMoney(Number(data.totalBalance), currency)}
          tone="accounts"
          change={{
            text: t("{amount} this month", { amount: formatDelta(balanceChange, currency) }),
            good: balanceChange === 0 ? null : balanceChange > 0,
          }}
          note={
            Number(data.goals.inGoals) > 0
              ? t("{amount} set aside in goals", { amount: formatMoney(Number(data.goals.inGoals), currency) })
              : undefined
          }
          trend={data.balanceTrend.map(Number)}
          trendLabel={t("Total balance at the end of each of the last 6 months")}
        />
        <Stat
          label={t("Income this month")}
          value={formatMoney(Number(data.income), currency)}
          tone="income"
          change={compare(Number(data.income), Number(data.lastMonthToDate.income), true)}
          trend={data.cashFlow.months.map((month) => Number(month.income))}
          trendLabel={t("Income in each of the last 6 months")}
        />
        <Stat
          label={t("Expense this month")}
          value={formatMoney(Number(data.expense), currency)}
          tone="expense"
          change={compare(Number(data.expense), Number(data.lastMonthToDate.expense), false)}
          trend={data.cashFlow.months.map((month) => Number(month.expense))}
          trendLabel={t("Expenses in each of the last 6 months")}
        />
        <Stat
          label={t("Net this month")}
          value={formatDelta(net, currency)}
          tone={net > 0 ? "income" : net < 0 ? "expense" : undefined}
          change={compare(net, Number(data.lastMonthToDate.net), true)}
          note={
            data.savingsRate === null
              ? undefined
              : data.savingsRate < 0
                ? t("Spent more than earned")
                : t("{percent} of income saved", { percent: formatPercent(data.savingsRate) })
          }
          trend={data.cashFlow.months.map((month) => Number(month.net))}
          trendLabel={t("Net in each of the last 6 months")}
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={t("Spending this month")}
          action={
            <Link href="/reports/spending" className={linkClass}>
              {t("Full report")}
            </Link>
          }
        >
          {data.spending.rows.length === 0 ? (
            <Empty>{t("No expenses this month yet.")}</Empty>
          ) : (
            <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
              <SpendingDonut
                height="h-44"
                label={t("Share of this month's expenses per category. The same numbers are listed next to it.")}
                data={topCategories(data.spending.rows, t("Other")).map((row) => ({ name: row.name, value: Number(row.amount), color: row.color }))}
              />
              <ul className="flex flex-col gap-2">
                {topCategories(data.spending.rows, t("Other")).map((row) => (
                  <li key={row.name} className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
                    <span className="tabular-nums">{formatMoney(Number(row.amount), currency)}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-muted">{formatPercent(row.share)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card
          title={t("Income vs. expenses")}
          action={
            <Link href="/reports/cash-flow" className={linkClass}>
              {t("Full report")}
            </Link>
          }
        >
          {data.cashFlow.hasData ? (
            <CashFlowChart
              height="h-48"
              data={data.cashFlow.months.map((month) => ({
                label: formatShortMonth(month.month, t),
                income: Number(month.income),
                expense: Number(month.expense),
                net: Number(month.net),
              }))}
            />
          ) : (
            <Empty>{t("No transactions in the last 6 months.")}</Empty>
          )}
        </Card>

        <Card title={t("Accounts")}>
          {data.accounts.length === 0 ? (
            <Empty>
              {t("No accounts yet.")}{" "}
              <Link href="/profile/accounts" className={linkClass}>
                {t("Add an account")}
              </Link>
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.accounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <AccountBadge icon={account.icon} color={account.color} />
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <span className="max-w-full truncate text-sm font-semibold">
                        {account.ownerName ? `${account.ownerName} · ` : ""}
                        {account.name}
                      </span>
                      <Badge tone="accounts">{t(ACCOUNT_TYPE_LABELS[account.type])}</Badge>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums ${Number(account.balance) < 0 ? "text-expense-text" : ""}`}
                  >
                    {formatMoney(Number(account.balance), currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={t("Goals")}
          action={
            <Link href="/goals" className={linkClass}>
              {t("All goals")}
            </Link>
          }
        >
          {data.goals.active.length === 0 ? (
            <Empty>
              {t("No goals yet.")}{" "}
              <Link href="/goals" className={linkClass}>
                {t("Create your first goal")}
              </Link>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.goals.active.map((goal) => {
                const saved = Number(goal.saved);
                const target = Number(goal.targetAmount);
                const progress = goalProgress({
                  savedCents: toCents(goal.saved),
                  targetCents: toCents(goal.targetAmount),
                  deadline: goal.deadline,
                  today,
                });
                return (
                  <li key={goal.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <CategoryBadge icon={goal.icon} color={goal.color} />
                      <Link href={`/goals/${goal.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong">
                        {goal.name}
                      </Link>
                      {goal.shared ? <Badge tone="accounts">{t("Shared")}</Badge> : null}
                      <span className="text-sm font-bold tabular-nums">{progress.percent}%</span>
                    </div>
                    <ProgressBar tone="goal" value={saved} max={target} label={t("{name} progress", { name: goal.name })} />
                    <p className="text-xs tabular-nums text-muted">
                      {formatMoney(saved, currency)} {t("of")} {formatMoney(target, currency)}
                      {goal.deadline
                        ? ` · ${t(progress.overdue ? "overdue since {date}" : "due {date}", { date: formatDate(goal.deadline, t) })}`
                        : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title={t("Budgets")}
          action={
            <Link href="/budgets" className={linkClass}>
              {t("All budgets")}
            </Link>
          }
        >
          {data.budgets.length === 0 ? (
            <Empty>
              {t("No budgets yet.")}{" "}
              <Link href="/budgets" className={linkClass}>
                {t("Set a budget")}
              </Link>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.budgets.map((budget) => {
                const spent = Number(budget.spent);
                const limit = Number(budget.amount);
                const over = Number(budget.remaining) < 0;
                return (
                  <li key={budget.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <CategoryBadge icon={budget.category.icon} color={budget.category.color} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{budget.category.name}</span>
                      <Badge>{budget.period === "weekly" ? t("Weekly") : t("Monthly")}</Badge>
                    </div>
                    <ProgressBar value={spent} max={limit} label={
                        budget.period === "weekly"
                          ? t("{category} weekly budget used", { category: budget.category.name })
                          : t("{category} monthly budget used", { category: budget.category.name })
                      } />
                    <p className={`text-xs tabular-nums ${over ? "font-semibold text-expense-text" : "text-muted"}`}>
                      {formatMoney(spent, currency)} {t("of")} {formatMoney(limit, currency)}
                      {over ? ` · ${t("over by {amount}", { amount: formatMoney(Math.abs(Number(budget.remaining)), currency) })}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title={t("Recurring")}
          action={
            <Link href="/profile/recurring" className={linkClass}>
              {t("All recurring")}
            </Link>
          }
        >
          {data.recurring.length === 0 ? (
            <Empty>
              {t("No active recurring transactions.")}{" "}
              <Link href="/profile/recurring" className={linkClass}>
                {t("Set one up")}
              </Link>
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.recurring.map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <KindIcon kind={rule.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{rule.note || describeRule(rule, t)}</p>
                    <p className="truncate text-xs text-muted">
                      {t("Next {date}", { date: formatDate(rule.nextDueDate, t) })} · {describeSchedule(rule.frequency, rule.intervalCount, t)}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{formatMoney(Number(rule.amount), currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title={t("Recent transactions")}
        action={
          <Link href="/transactions" className={linkClass}>
            {t("View all")}
          </Link>
        }
      >
        {data.recent.length === 0 ? (
          <Empty>
            {t("No transactions yet.")}{" "}
            <Link href="/transactions" className={linkClass}>
              {t("Add your first transaction")}
            </Link>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.recent.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                {item.type === "transfer" ? (
                  <TransferBadge />
                ) : item.category ? (
                  <CategoryBadge icon={item.category.icon} color={item.category.color} />
                ) : (
                  <CategoryBadge icon="tag" color="#6b7c85" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.note || (item.type === "transfer" ? t("Transfer") : item.category?.name || t("Uncategorized"))}</p>
                  <p className="truncate text-xs text-muted">
                    {formatDate(item.date, t)} · {accountLabel(item)}
                    {item.category && item.note ? ` · ${item.category.name}` : ""}
                  </p>
                </div>
                <Amount type={item.type} amount={item.amount} currency={currency} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
