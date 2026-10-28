import { z } from "zod";
import { msg } from "@/lib/i18n/translate";

// numeric(14,2): up to 12 integer digits and 2 decimals, sent as text. Money is never negative;
// the transaction type decides the sign. Normalized to two decimals, e.g. "12" -> "12.00".
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const MONEY_MESSAGE = msg("Enter an amount like 100 or 100.50");

/** Accepts a comma or a dot as the decimal separator ("7,5" -> "7.5"); anything else is left for the pattern to reject. */
export function normalizeMoneyInput(value: string): string {
  const trimmed = value.trim();
  return /^[^.,]*,[^.,]*$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed;
}

const moneyText = z.string().transform(normalizeMoneyInput).pipe(z.string().regex(MONEY_PATTERN, MONEY_MESSAGE));

/** 0 or more, for example an account's initial balance. */
export const nonNegativeMoney = moneyText.transform((value) => Number(value).toFixed(2));

/** More than 0, for example a transaction or budget amount. */
export const positiveMoney = moneyText
  .refine((value) => Number(value) > 0, msg("Amount must be greater than 0"))
  .transform((value) => Number(value).toFixed(2));
