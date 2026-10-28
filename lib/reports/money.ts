// Report money maths. Database sums arrive as `numeric(14,2)` text; adding them in whole cents
// keeps totals exact (no floating-point drift on 0.1 + 0.2).

/** "1234.50" -> 123450. */
export function toCents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/** 123450 -> "1234.50". */
export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Income minus expenses as a share of income, or null when there was no income. */
export function savingsRate(incomeCents: number, expenseCents: number): number | null {
  return incomeCents > 0 ? (incomeCents - expenseCents) / incomeCents : null;
}

/** Relative change from `before` to `after`, or null when there is nothing to compare with. */
export function changeRatio(afterCents: number, beforeCents: number): number | null {
  return beforeCents > 0 ? (afterCents - beforeCents) / beforeCents : null;
}
