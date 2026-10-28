/**
 * Currencies a user can choose. A currency is only a label for how amounts are shown: nothing is
 * converted when it changes. Adding one later is a code change only (the column is plain text).
 */
export const CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES = CURRENCIES.map((currency) => currency.code) as [CurrencyCode, ...CurrencyCode[]];

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/** "USD ($)" for dropdowns. */
export function currencyLabel(code: CurrencyCode): string {
  const currency = CURRENCIES.find((item) => item.code === code);
  return currency ? `${currency.code} (${currency.symbol})` : code;
}

/** Narrows stored text to a known currency, falling back to the default for anything else. */
export function toCurrencyCode(value: string | null | undefined): CurrencyCode {
  return CURRENCIES.find((currency) => currency.code === value)?.code ?? DEFAULT_CURRENCY;
}
