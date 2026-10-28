"use client";

import type { ReactNode } from "react";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatDate, formatDelta } from "@/lib/format";
import { useT } from "@/lib/i18n/client";

type Dated = { id: string; date: string };

/** Items are newest first, so entries of the same day are already next to each other. */
function groupByDate<T extends Dated>(items: T[]) {
  const groups: { date: string; items: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}

/**
 * The phone layout of a dated list: entries grouped under their date, with the day's total (in cents, signed) in grey
 * on the date row. Hidden from `lg` up, where the page shows its own wide layout.
 */
export function DayGroupList<T extends Dated>({
  items,
  label,
  dayTotal,
  renderRow,
}: {
  items: T[];
  label: string;
  /** The day's total in cents: income minus expenses, deposits minus withdrawals. */
  dayTotal: (items: T[]) => number;
  renderRow: (item: T) => ReactNode;
}) {
  const t = useT();
  const { currency } = useRegion();

  return (
    <div className="flex flex-col gap-4 lg:hidden" aria-label={label} role="list">
      {groupByDate(items).map((group) => {
        const total = dayTotal(group.items) / 100;
        const date = formatDate(group.date, t);
        return (
          <section key={group.date} role="listitem" aria-label={date} className="flex flex-col gap-1.5">
            <header className="flex items-baseline justify-between gap-2 px-1">
              <h3 className="text-sm font-bold">{date}</h3>
              <p className="text-xs font-semibold tabular-nums text-muted" title={t("Day total")}>
                <span className="sr-only">{t("Day total")}: </span>
                {formatDelta(total, currency)}
              </p>
            </header>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {group.items.map((item) => (
                <li key={item.id}>{renderRow(item)}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
