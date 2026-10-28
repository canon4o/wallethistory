"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteBudget } from "@/lib/actions/budgets";
import type { BudgetHint, BudgetItem } from "@/lib/data/budgets";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatCompactMoney, formatDate, formatDayRange, formatMoney, formatMonth, formatShortMonth } from "@/lib/format";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { RowTapTarget } from "@/components/ui/RowTapTarget";
import { PLANNED_STRIPES, ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { BudgetForm } from "./BudgetForm";
import { alertLevel, DEFAULT_ALERT_THRESHOLD } from "@/lib/budget-alerts";
import { toCents } from "@/lib/reports/money";
import { useT } from "@/lib/i18n/client";
import { msg, type Translate } from "@/lib/i18n/translate";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; item: BudgetItem }
  | { kind: "delete"; item: BudgetItem }
  | null;

type BudgetsManagerProps = {
  budgets: BudgetItem[];
  /** The user's expense categories. */
  categories: Array<{ id: string; name: string; icon: string; color: string }>;
  /** Last period's spending and the forecast per category, shown in the form to help choose a limit. */
  hints?: Record<string, BudgetHint>;
  /** The user's warning threshold (percent of the limit), used by the status filter. */
  threshold?: number;
};

type PeriodFilter = "all" | BudgetItem["period"];
type StatusFilter = "all" | "over" | "near" | "ok";
type SortKey = "usage" | "name" | "remaining";

/** Link to the transactions behind a budget: its category inside the budget's current period. */
function transactionsHref(item: BudgetItem) {
  const params = new URLSearchParams({
    from: item.range.start,
    to: item.range.end,
    type: "expense",
    category: `expense:${item.category.name}`,
  });
  return `/transactions?${params.toString()}`;
}

function statusOf(item: BudgetItem, threshold: number): Exclude<StatusFilter, "all"> {
  const level = alertLevel(toCents(item.spent), toCents(item.amount), threshold);
  return level === "exceeded" ? "over" : level === "warning" ? "near" : "ok";
}

/** Totals for one period kind; weekly and monthly limits are never added together. */
function BudgetSummary({ budgets, threshold }: { budgets: BudgetItem[]; threshold: number }) {
  const t = useT();
  const { currency } = useRegion();
  const groups = (["monthly", "weekly"] as const)
    .map((period) => ({ period, items: budgets.filter((item) => item.period === period) }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
      {groups.map(({ period, items }) => {
        const limit = items.reduce((sum, item) => sum + toCents(item.amount), 0) / 100;
        const spent = items.reduce((sum, item) => sum + toCents(item.spent), 0) / 100;
        const over = limit < spent;
        const statuses = items.map((item) => statusOf(item, threshold));
        const overCount = statuses.filter((status) => status === "over").length;
        const nearCount = statuses.filter((status) => status === "near").length;
        const title = period === "weekly" ? t("Weekly budgets") : t("Monthly budgets");
        return (
          <section
            key={period}
            aria-label={period === "weekly" ? t("Weekly budgets summary") : t("Monthly budgets summary")}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
          >
            <p className="text-sm font-bold">{title}</p>
            <ProgressBar value={spent} max={limit} label={t("{title} used", { title })} />
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">{t("Budgeted")}</dt>
                <dd className="font-bold tabular-nums">{formatMoney(limit, currency)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">{t("Spent")}</dt>
                <dd className="font-bold tabular-nums">{formatMoney(spent, currency)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">{over ? t("Over by") : t("Remaining")}</dt>
                <dd className={`font-bold tabular-nums ${over ? "text-expense-text" : ""}`}>
                  {formatMoney(Math.abs(limit - spent), currency)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted">
              {overCount > 0 ? <span className="font-bold text-expense-text">{t("{count} over the limit", { count: overCount })}</span> : null}
              {overCount > 0 && nearCount > 0 ? " · " : null}
              {nearCount > 0 ? <span className="font-bold">{t("{count} close to the limit", { count: nearCount })}</span> : null}
              {overCount === 0 && nearCount === 0 ? t("All budgets are on track") : null}
            </p>
          </section>
        );
      })}
    </div>
  );
}

// More spending is bad news, less is good news.
const TRENDS = {
  up: { Icon: ArrowUpRight, tone: "text-expense-text", label: msg("Increasing") },
  down: { Icon: ArrowDownRight, tone: "text-income-text", label: msg("Decreasing") },
  stable: { Icon: ArrowRight, tone: "text-muted", label: msg("Stable") },
} as const;

/** A small arrow next to the forecast: where the category's spending is heading. */
function TrendArrow({ trend }: { trend: NonNullable<BudgetItem["trend"]> }) {
  const t = useT();
  const { Icon, tone, label } = TRENDS[trend];
  return (
    <span className={`inline-flex items-center ${tone}`} title={t(label)}>
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{t(label)}</span>
    </span>
  );
}

/** The last complete periods as bars against the limit. A native <details>, so it needs no state. */
function BudgetHistory({ item }: { item: BudgetItem }) {
  const t = useT();
  const { currency } = useRegion();
  const limit = Number(item.amount);
  const values = item.history.map((entry) => Number(entry.spent));
  const top = Math.max(limit, ...values);
  const label = (start: string, end: string) =>
    item.period === "weekly" ? formatDayRange(start, end, t) : formatMonth(start, t);
  return (
    <details className="group relative z-10 text-xs">
      <summary className="inline-flex min-h-10 cursor-pointer items-center text-xs font-semibold text-primary-strong">
        {item.period === "weekly" ? t("Last 6 weeks") : t("Last 6 months")}
      </summary>
      <div className="mt-1 flex gap-1.5">
        {item.history.map((entry, index) => {
          const spent = values[index];
          const text = t("{period}: spent {spent} of {limit}", {
            period: label(entry.range.start, entry.range.end),
            spent: formatMoney(spent, currency),
            limit: formatMoney(limit, currency),
          });
          return (
            <div key={entry.range.start} className="flex min-w-0 flex-1 flex-col items-stretch gap-1" title={text}>
              <span className="sr-only">{text}</span>
              <span aria-hidden="true" className={`truncate text-center font-bold tabular-nums ${spent > limit ? "text-expense-text" : ""}`}>
                {formatCompactMoney(spent, currency).replace(".0", "")}
              </span>
              <div aria-hidden="true" className="relative flex h-16 items-end border-b border-border">
                <div className="absolute inset-x-0 border-t border-dashed border-text/40" style={{ bottom: `${(limit / top) * 100}%` }} />
                <div
                  className={`w-full rounded-t ${spent > limit ? "bg-expense" : "bg-primary"}`}
                  style={{ height: `${(spent / top) * 100}%`, minHeight: spent > 0 ? 2 : 0 }}
                />
              </div>
              <span aria-hidden="true" className="truncate text-center text-muted">
                {item.period === "weekly" ? formatDayRange(entry.range.start, entry.range.start, t) : formatShortMonth(entry.range.start, t)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-muted">{t("The dashed line is the limit ({limit}).", { limit: formatMoney(limit, currency) })}</p>
    </details>
  );
}

function periodLabel(item: BudgetItem, t: Translate) {
  return item.period === "weekly"
    ? `${formatDate(item.range.start, t)} – ${formatDate(item.range.end, t)}`
    : formatMonth(item.range.start, t);
}

export function BudgetsManager({ budgets, categories, hints, threshold = DEFAULT_ALERT_THRESHOLD }: BudgetsManagerProps) {
  const t = useT();
  const { currency } = useRegion();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("usage");
  const visible = useMemo(() => {
    const filtered = budgets.filter(
      (item) =>
        (periodFilter === "all" || item.period === periodFilter) &&
        (statusFilter === "all" || statusOf(item, threshold) === statusFilter),
    );
    // "usage" is the order the data layer already returns.
    if (sort === "name") return [...filtered].sort((a, b) => a.category.name.localeCompare(b.category.name));
    if (sort === "remaining") return [...filtered].sort((a, b) => Number(a.remaining) - Number(b.remaining));
    return filtered;
  }, [budgets, periodFilter, statusFilter, sort, threshold]);

  function close() {
    setDialog(null);
    setDeleteError(null);
  }

  async function confirmDelete(item: BudgetItem) {
    setPending(true);
    setDeleteError(null);
    const result = await deleteBudget(item.id);
    setPending(false);
    if (result.ok) close();
    else setDeleteError(result.error);
  }

  const canAdd = categories.length > 0;
  const addButton = (
    <Button onClick={() => setDialog({ kind: "create" })} disabled={!canAdd}>
      <Plus className="size-4" aria-hidden="true" />
      {t("Add budget")}
    </Button>
  );
  const name = (item: BudgetItem) =>
    item.period === "weekly"
      ? t("weekly budget for {category}", { category: item.category.name })
      : t("monthly budget for {category}", { category: item.category.name });

  return (
    <>
      {budgets.length === 0 ? (
        <EmptyState
          title={t("No budgets yet")}
          description={
            canAdd
              ? t("A budget sets a weekly or monthly spending limit for an expense category.")
              : t("Budgets need an expense category. Create one under Profile → Categories first.")
          }
          action={canAdd ? addButton : undefined}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {canAdd ? null : (
              <p className="text-sm text-muted">
                {t("Create an expense category under")}{" "}
                <Link href="/profile/categories" className="font-semibold text-primary-strong underline">
                  {t("Profile → Categories")}
                </Link>{" "}
                {t("to add budgets.")}
              </p>
            )}
            {addButton}
          </div>
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-4">
          {budgets.length > 1 ? (
            <div className="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
              <BudgetSummary budgets={budgets} threshold={threshold} />
            </div>
          ) : null}
          <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
          {budgets.length > 1 ? (
            <div className="grid grid-cols-3 gap-2">
              <Select id="budget-filter-period" label={t("Period")} value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}>
                <option value="all">{t("All periods")}</option>
                <option value="weekly">{t("Weekly")}</option>
                <option value="monthly">{t("Monthly")}</option>
              </Select>
              <Select id="budget-filter-status" label={t("Status")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">{t("All statuses")}</option>
                <option value="over">{t("Over the limit")}</option>
                <option value="near">{t("Close to the limit")}</option>
                <option value="ok">{t("On track")}</option>
              </Select>
              <Select id="budget-sort" label={t("Sort by")} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="usage">{t("Most used")}</option>
                <option value="name">{t("Name")}</option>
                <option value="remaining">{t("Least remaining")}</option>
              </Select>
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted">{t("No budgets match these filters.")}</p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {visible.map((item) => {
              const amount = Number(item.amount);
              const spent = Number(item.spent);
              const remaining = Number(item.remaining);
              const over = remaining < 0;
              return (
                <li key={item.id} className="relative flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center gap-3">
                    <CategoryBadge icon={item.category.icon} color={item.category.color} />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <p className="max-w-full truncate text-sm font-bold">{item.category.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <Badge>{item.period === "weekly" ? t("Weekly") : t("Monthly")}</Badge>
                        {periodLabel(item, t)}
                      </p>
                    </div>
                    <IconButton
                      label={t("Edit {name}", { name: name(item) })}
                      className="max-lg:hidden"
                      onClick={() => setDialog({ kind: "edit", item })}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t("Delete {name}", { name: name(item) })}
                      className="max-lg:hidden"
                      onClick={() => setDialog({ kind: "delete", item })}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                  <ProgressBar value={spent} max={amount} planned={over ? 0 : Number(item.planned)} marker={item.elapsedPercent} markerLabel={t("Today: {percent}% of the period has passed", { percent: item.elapsedPercent })} label={
                      item.period === "weekly"
                        ? t("{category} weekly budget used", { category: item.category.name })
                        : t("{category} monthly budget used", { category: item.category.name })
                    } />
                  <dl className="grid grid-cols-3 gap-2 text-xs lg:grid-cols-5">
                    <div>
                      <dt className="text-muted">{t("Spent")}</dt>
                      <dd className="text-sm font-bold tabular-nums">
                        <Link
                          href={transactionsHref(item)}
                          aria-label={t("View {category} transactions", { category: item.category.name })}
                          className="relative z-10 underline decoration-dotted underline-offset-2 hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-primary-strong"
                        >
                          {formatMoney(spent, currency)}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("Limit")}</dt>
                      <dd className="text-sm font-bold tabular-nums">{formatMoney(amount, currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{over ? t("Over by") : t("Remaining")}</dt>
                      <dd className={`text-sm font-bold tabular-nums ${over ? "text-expense-text" : ""}`}>
                        {formatMoney(Math.abs(remaining), currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{item.period === "weekly" ? t("Last week") : t("Last month")}</dt>
                      <dd className="text-sm font-bold tabular-nums">{formatMoney(Number(item.lastSpent), currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("Forecast")}</dt>
                      <dd className="flex items-center gap-1 text-sm font-bold tabular-nums">
                        <span className={item.forecast !== null && Number(item.forecast) > amount ? "text-expense-text" : ""}>
                          {item.forecast === null ? "n/a" : formatMoney(Number(item.forecast), currency)}
                        </span>
                        {item.trend ? <TrendArrow trend={item.trend} /> : null}
                      </dd>
                    </div>
                  </dl>
                  {item.projected !== null && !over ? (
                    <p className={`text-xs ${Number(item.projected) > amount ? "font-bold text-expense-text" : "text-muted"}`}>
                      {Number(item.projected) > amount
                        ? t("At this pace you will spend {amount}, over the limit by the end of the period.", {
                            amount: formatMoney(Number(item.projected), currency),
                          })
                        : t("At this pace you will spend {amount} by the end of the period.", {
                            amount: formatMoney(Number(item.projected), currency),
                          })}
                    </p>
                  ) : null}
                  {Number(item.planned) > 0 ? (
                    <p className={`flex items-start gap-1.5 text-xs ${!over && spent + Number(item.planned) > amount ? "font-bold text-expense-text" : "text-muted"}`}>
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 size-2.5 shrink-0 rounded-sm ${!over && spent + Number(item.planned) > amount ? "bg-expense" : "bg-primary"}`}
                        style={PLANNED_STRIPES}
                      />
                      {!over && spent + Number(item.planned) > amount
                        ? t("{amount} of recurring expenses are still to come, which would put you {over} over the limit.", {
                            amount: formatMoney(Number(item.planned), currency),
                            over: formatMoney(spent + Number(item.planned) - amount, currency),
                          })
                        : t("{amount} of recurring expenses are still to come this period.", {
                            amount: formatMoney(Number(item.planned), currency),
                          })}
                    </p>
                  ) : null}
                  <BudgetHistory item={item} />
                  <RowTapTarget label={t("Edit {name}", { name: name(item) })} onClick={() => setDialog({ kind: "edit", item })} />
                </li>
              );
            })}
          </ul>
          </div>
          </div>
        </div>
      )}

      <Modal open={dialog?.kind === "create"} title={t("Add budget")} onClose={close}>
        <BudgetForm categories={categories} hints={hints} onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "edit"} title={t("Edit budget")} onClose={close}>
        {dialog?.kind === "edit" ? (
          <BudgetForm
            key={dialog.item.id}
            categories={categories}
            hints={hints}
            budget={{
              id: dialog.item.id,
              categoryId: dialog.item.category.id,
              amount: dialog.item.amount,
              period: dialog.item.period,
            }}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete", item: dialog.item })}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("Delete budget")}
        description={
          dialog?.kind === "delete"
            ? t("Delete the {name}? Your transactions are not affected.", { name: name(dialog.item) })
            : ""
        }
        confirmLabel={t("Delete budget")}
        pending={pending}
        error={deleteError}
        onConfirm={() => dialog?.kind === "delete" && confirmDelete(dialog.item)}
        onClose={close}
      />
    </>
  );
}
