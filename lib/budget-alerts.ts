// Budget alert levels. Pure logic (no database, no React) so other channels, such as email or a
// webhook, can reuse it later. Amounts are whole cents (see lib/reports/money.ts), never floats.

export const BUDGET_ALERT_LEVELS = ["warning", "exceeded"] as const;
export type BudgetAlertLevel = (typeof BUDGET_ALERT_LEVELS)[number];

export const MIN_ALERT_THRESHOLD = 50;
export const MAX_ALERT_THRESHOLD = 99;
export const DEFAULT_ALERT_THRESHOLD = 80;

/**
 * `exceeded` when spending is above the limit, `warning` when it has reached the threshold (a
 * percentage of the limit) without going over, otherwise null.
 */
export function alertLevel(spentCents: number, amountCents: number, thresholdPercent: number): BudgetAlertLevel | null {
  if (spentCents > amountCents) return "exceeded";
  // spent / amount >= threshold / 100, without dividing. BigInt: cents * 100 can pass 2^53 for the largest amounts.
  if (BigInt(spentCents) * BigInt(100) >= BigInt(thresholdPercent) * BigInt(amountCents)) return "warning";
  return null;
}

/** The share of the limit that is used as a whole percent, rounded down (0 for a limit of 0). */
export function usedPercent(spentCents: number, amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Number((BigInt(spentCents) * BigInt(100)) / BigInt(amountCents));
}
