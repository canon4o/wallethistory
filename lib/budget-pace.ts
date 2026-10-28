import type { DateRange } from "./budget-period";

// Spending pace of a budget: how far through its period we are, and where the spending is heading
// if it continues at the same rate. Pure logic in whole cents, like lib/budget-alerts.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / DAY_MS);
}

/** Days of the period that have passed, today included, and the days in the period. */
export function periodDays(range: DateRange, today: string): { elapsed: number; total: number } {
  const total = dayNumber(range.end) - dayNumber(range.start) + 1;
  const elapsed = dayNumber(today) - dayNumber(range.start) + 1;
  return { elapsed: Math.min(total, Math.max(0, elapsed)), total };
}

/** The share of the period that has passed as a whole percent, rounded down. */
export function elapsedPercent(range: DateRange, today: string): number {
  const { elapsed, total } = periodDays(range, today);
  return Math.floor((elapsed * 100) / total);
}

/**
 * The spending at the end of the period if it continues at the pace so far, in cents; null before
 * the period has started or while nothing is spent yet.
 */
export function projectedCents(spentCents: number, range: DateRange, today: string): number | null {
  const { elapsed, total } = periodDays(range, today);
  if (elapsed === 0 || spentCents <= 0) return null;
  return Math.round((spentCents * total) / elapsed);
}
