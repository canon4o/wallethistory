import type { CurrencyCode } from "@/lib/currencies";
import { formatTransactionAmount } from "@/lib/format";
import { msg } from "@/lib/i18n/translate";

const COLORS = { income: "text-income-text", expense: "text-text", transfer: "text-text" } as const;

/** Screen-reader labels for a row: the type is said in words because expenses carry no sign. */
export const LABEL_KEYS = {
  income: msg("income of {amount} on {date}"),
  expense: msg("expense of {amount} on {date}"),
  transfer: msg("transfer of {amount} on {date}"),
} as const;

/** An amount in a list row: income in the income color with a +; expenses and transfers in the normal text color, no sign. */
export function Amount({
  type,
  amount,
  currency,
}: {
  type: "income" | "expense" | "transfer";
  amount: string;
  currency: CurrencyCode;
}) {
  return (
    <span className={`font-bold tabular-nums ${COLORS[type]}`}>{formatTransactionAmount(Number(amount), type, currency)}</span>
  );
}
