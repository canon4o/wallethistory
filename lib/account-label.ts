import type { TransactionItem } from "@/lib/data/transactions";

/**
 * "Cash", "Ann · Cash" for someone else's account, and "Ann · Cash → Ben · Bank" for a transfer
 * between people. Own accounts stay plain unless the transfer involves another person, so
 * both sides always say whose they are.
 */
export function accountLabel(item: Pick<TransactionItem, "account" | "transferTo" | "owner">): string {
  const named = (account: { name: string; ownerName: string }) => `${account.ownerName} · ${account.name}`;
  if (item.transferTo) {
    const crossPerson = !item.account.isMine || !item.transferTo.isMine;
    return crossPerson
      ? `${named(item.account)} → ${named(item.transferTo)}`
      : `${item.account.name} → ${item.transferTo.name}`;
  }
  return item.account.isMine ? item.account.name : named(item.account);
}
