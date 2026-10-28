"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { CurrencyCode } from "@/lib/currencies";
import type { GoalItem } from "@/lib/data/goals";
import { formatDate, formatMoney } from "@/lib/format";
import { goalProgress } from "@/lib/goals/progress";
import { toCents } from "@/lib/reports/money";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/translate";

/** "Due 2026-12-01", "Overdue since …", or nothing without a deadline. */
export function deadlineText(deadline: string | null, overdue: boolean, t: Translate): string | null {
  if (!deadline) return null;
  return overdue
    ? t("Overdue since {date}", { date: formatDate(deadline, t) })
    : t("Due {date}", { date: formatDate(deadline, t) });
}

/** One goal as a card that opens its page: name, badges, progress bar and the numbers. */
export function GoalCard({ goal, currency, today }: { goal: GoalItem; currency: CurrencyCode; today: string }) {
  const t = useT();
  const progress = goalProgress({
    savedCents: toCents(goal.saved),
    targetCents: toCents(goal.targetAmount),
    deadline: goal.deadline,
    today,
  });
  const saved = Number(goal.saved);
  const target = Number(goal.targetAmount);
  const due = deadlineText(goal.deadline, progress.overdue, t);
  return (
    <li>
      <Link
        href={`/goals/${goal.id}`}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 hover:bg-background focus-visible:outline-2 focus-visible:outline-primary-strong"
      >
        <span className="flex items-center gap-3">
          <CategoryBadge icon={goal.icon} color={goal.color} />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="max-w-full truncate text-sm font-bold">{goal.name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              {progress.completed ? <Badge tone="income">{t("Completed")}</Badge> : null}
              {goal.archived ? <Badge>{t("Archived")}</Badge> : null}
              {goal.shared ? <Badge tone="accounts">{t("Shared")}</Badge> : null}
              {goal.owner.isMine ? null : <Badge>{t("{name}'s goal", { name: goal.owner.name })}</Badge>}
            </span>
          </span>
          <span className="text-sm font-bold tabular-nums">{progress.percent}%</span>
        </span>
        <ProgressBar tone="goal" value={saved} max={target} label={t("{name} progress", { name: goal.name })} />
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
          <span className="tabular-nums">
            <span className="text-sm font-bold text-text">{formatMoney(saved, currency)}</span> {t("of")}{" "}
            {formatMoney(target, currency)}
          </span>
          {due ? (
            <span className={`inline-flex items-center gap-1 ${progress.overdue ? "font-semibold text-expense-text" : ""}`}>
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {due}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
