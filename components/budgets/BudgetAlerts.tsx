"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { dismissBudgetAlert } from "@/lib/actions/budget-alerts";
import type { BudgetAlert } from "@/lib/data/budget-alerts";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { useRegion } from "@/components/layout/RegionProvider";
import { cn } from "@/components/ui/cn";
import type { CurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/translate";

const MAX_SHOWN = 3;

const keyOf = (alert: BudgetAlert) => `${alert.budgetId}|${alert.periodStart}|${alert.level}`;

function alertText(alert: BudgetAlert, t: Translate, currency: CurrencyCode) {
  const values = {
    name: alert.category.name,
    percent: alert.percent,
    spent: formatMoney(Number(alert.spent), currency),
    amount: formatMoney(Number(alert.amount), currency),
  };
  if (alert.level === "exceeded") {
    return alert.period === "weekly"
      ? t("{name}: over your weekly budget ({spent} of {amount})", values)
      : t("{name}: over your monthly budget ({spent} of {amount})", values);
  }
  return alert.period === "weekly"
    ? t("{name}: {percent}% of your weekly budget used ({spent} of {amount})", values)
    : t("{name}: {percent}% of your monthly budget used ({spent} of {amount})", values);
}

/**
 * Budgets that are close to or over their limit, under the announcement banner on every page.
 * Dismissing hides an alert at once and saves it, so it stays hidden on every device until the
 * budget's next period.
 */
export function BudgetAlerts({ alerts }: { alerts: BudgetAlert[] }) {
  const t = useT();
  const { currency } = useRegion();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const open = alerts.filter((alert) => !dismissed.has(keyOf(alert)));
  if (open.length === 0) return null;
  const shown = open.slice(0, MAX_SHOWN);
  const more = open.length - shown.length;

  async function dismiss(alert: BudgetAlert) {
    setDismissed((current) => new Set(current).add(keyOf(alert)));
    const result = await dismissBudgetAlert({ budgetId: alert.budgetId, level: alert.level, periodStart: alert.periodStart });
    if (!result.ok) {
      // Not saved: show it again rather than pretend it is gone.
      setDismissed((current) => {
        const next = new Set(current);
        next.delete(keyOf(alert));
        return next;
      });
    }
  }

  return (
    <section aria-label={t("Budget alerts")} className="flex flex-col">
      {shown.map((alert) => {
        const exceeded = alert.level === "exceeded";
        return (
          <div
            key={keyOf(alert)}
            role="status"
            data-level={alert.level}
            className={cn(
              "flex items-center gap-3 border-b px-4 py-2 text-sm",
              exceeded ? "border-expense bg-expense/15" : "border-planning bg-planning/15",
            )}
          >
            <CategoryBadge icon={alert.category.icon} color={alert.category.color} />
            <p className="min-w-0 flex-1 break-words">
              {alertText(alert, t, currency)}{" "}
              <Link href="/budgets" className="font-semibold underline focus-visible:outline-2 focus-visible:outline-primary-strong">
                {t("View budgets")}
              </Link>
            </p>
            <button
              type="button"
              aria-label={t("Dismiss alert for {name}", { name: alert.category.name })}
              onClick={() => void dismiss(alert)}
              className="-my-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-primary-strong"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {more > 0 ? (
        <div className="border-b border-border bg-surface px-4 py-2 text-sm">
          <Link href="/budgets" className="font-semibold underline focus-visible:outline-2 focus-visible:outline-primary-strong">
            {t("+{count} more", { count: more })}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
