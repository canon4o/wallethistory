"use client";

import { useMemo } from "react";
import { Listbox, type ListboxProps } from "@/components/ui/Listbox";
import { CategoryBadge } from "./CategoryIcon";
import { useT } from "@/lib/i18n/client";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatMoney } from "@/lib/format";

export type CategorySelectItem = {
  id: string;
  name: string;
  icon: string;
  color: string;
  type?: "income" | "expense";
  /** Budget limit minus spending in the current period (numeric string, negative when over); only for budgeted categories. */
  budgetRemaining?: string;
};

type CategorySelectProps = Omit<ListboxProps, "options"> & {
  categories: CategorySelectItem[];
  /** Adds a leading option with an empty value, for example "No category" or "All categories". */
  emptyLabel?: string;
  /** Lists the categories under Expense and Income headings (needs `type` on each category). */
  groupByType?: boolean;
};

/** Category dropdown that shows each category's icon badge. */
export function CategorySelect({ categories, emptyLabel, groupByType, ...props }: CategorySelectProps) {
  const t = useT();
  const { currency } = useRegion();
  const options = useMemo(() => {
    const toOption = (category: CategorySelectItem) => ({
      value: category.id,
      label: category.name,
      icon: <CategoryBadge icon={category.icon} color={category.color} />,
      detail: budgetDetail(category.budgetRemaining),
      group: groupByType ? (category.type === "income" ? t("Income") : t("Expense")) : undefined,
    });
    const budgetDetail = (remaining?: string) => {
      if (remaining === undefined) return undefined;
      const left = Number(remaining);
      return left < 0
        ? t("over by {amount}", { amount: formatMoney(-left, currency) })
        : t("{amount} left", { amount: formatMoney(left, currency) });
    };
    const items = groupByType
      ? [
          ...categories.filter((category) => category.type !== "income"),
          ...categories.filter((category) => category.type === "income"),
        ]
      : categories;
    return [...(emptyLabel ? [{ value: "", label: emptyLabel }] : []), ...items.map(toOption)];
  }, [categories, currency, emptyLabel, groupByType, t]);

  return <Listbox {...props} options={options} />;
}
