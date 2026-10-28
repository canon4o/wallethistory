"use client";

import { useMemo } from "react";
import { Listbox, type ListboxProps } from "@/components/ui/Listbox";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatMoney } from "@/lib/format";
import { AccountBadge } from "./AccountIcon";

export type AccountSelectItem = { id: string; name: string; icon: string; color: string;
  /** numeric(14,2) string; shown next to the name when present. */
  balance?: string;
};

type AccountSelectProps = Omit<ListboxProps, "options"> & {
  accounts: AccountSelectItem[];
  /** Adds a leading option with an empty value, for example "All accounts". */
  emptyLabel?: string;
  /** Hides one account, for example the From account when picking the To account of a transfer. */
  excludeId?: string;
};

/** Account dropdown that shows each account's icon badge. */
export function AccountSelect({ accounts, emptyLabel, excludeId, ...props }: AccountSelectProps) {
  const { currency } = useRegion();
  const options = useMemo(
    () => [
      ...(emptyLabel ? [{ value: "", label: emptyLabel }] : []),
      ...accounts
        .filter((account) => account.id !== excludeId)
        .map((account) => ({
          value: account.id,
          label: account.name,
          detail: account.balance === undefined ? undefined : formatMoney(Number(account.balance), currency),
          icon: <AccountBadge icon={account.icon} color={account.color} />,
        })),
    ],
    [accounts, currency, emptyLabel, excludeId],
  );

  return <Listbox {...props} options={options} />;
}
