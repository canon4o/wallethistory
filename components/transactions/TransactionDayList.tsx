"use client";

import { Repeat } from "lucide-react";
import type { TransactionItem } from "@/lib/data/transactions";
import { accountLabel } from "@/lib/account-label";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { DayGroupList } from "@/components/ui/DayGroupList";
import { Amount, LABEL_KEYS } from "./Amount";
import { TransferBadge } from "./TransferBadge";
import { useT } from "@/lib/i18n/client";

/** Income minus expenses of the day, in cents; transfers only move money between accounts. */
function dayNet(items: TransactionItem[]): number {
  return items.reduce((sum, item) => {
    if (item.type === "transfer") return sum;
    const cents = Math.round(Number(item.amount) * 100);
    return item.type === "income" ? sum + cents : sum - cents;
  }, 0);
}

/**
 * The phone layout: entries grouped under their date, with the day's net total on the date row.
 * Tapping a row opens it for editing (deleting lives in the edit dialog).
 */
export function TransactionDayList({
  items,
  onSelect,
}: {
  items: TransactionItem[];
  onSelect: (item: TransactionItem) => void;
}) {
  const t = useT();
  return (
    <DayGroupList
      items={items}
      label={t("Transactions, newest first")}
      dayTotal={dayNet}
      renderRow={(item) => <Row item={item} onSelect={onSelect} />}
    />
  );
}

function Row({ item, onSelect }: { item: TransactionItem; onSelect: (item: TransactionItem) => void }) {
  const t = useT();
  const { currency } = useRegion();
  const title = item.type === "transfer" ? t("Transfer") : (item.category?.name ?? t("Uncategorized"));
  const muted = item.type !== "transfer" && !item.category;
  const details = [accountLabel(item), item.note].filter(Boolean).join(" · ");
  const content = (
    <>
      <span className="shrink-0">
        {item.type === "transfer" ? (
          <TransferBadge />
        ) : item.category ? (
          <CategoryBadge icon={item.category.icon} color={item.category.color} />
        ) : (
          <span className="inline-flex size-8 rounded-lg border border-border bg-background" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className={`truncate text-sm ${muted ? "text-muted" : "font-semibold"}`}>{title}</span>
          {item.recurring ? (
            <span className="shrink-0 text-muted" title={t("Recurring")}>
              <Repeat className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("Recurring")}</span>
            </span>
          ) : null}
        </span>
        {details ? <span className="truncate text-xs text-muted">{details}</span> : null}
        {item.tags.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label={t("Tags")}>
            {item.tags.map((tag) => (
              <li key={tag.id} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs">
                {tag.name}
              </li>
            ))}
          </ul>
        ) : null}
      </span>
      <span className="shrink-0 text-sm">
        <Amount type={item.type} amount={item.amount} currency={currency} />
      </span>
    </>
  );
  const className = "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left";
  // Household members' transactions are read-only.
  if (!item.owner.isMine) return <div className={className}>{content}</div>;
  const label = t(LABEL_KEYS[item.type], {
    amount: formatMoney(Number(item.amount), currency),
    date: formatDate(item.date, t),
  });
  return (
    <button
      type="button"
      aria-label={t("Edit {name}", { name: label })}
      onClick={() => onSelect(item)}
      className={`${className} hover:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-strong`}
    >
      {content}
    </button>
  );
}
