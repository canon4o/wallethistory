// The maths behind the forecast report, on whole cents and `YYYY-MM-DD` strings, so it needs no
// database. Amounts are expenses (always positive).

import { monthRange, type DateRange } from "@/lib/budget-period";
import { monthStarts, presetRange } from "./periods";

/** How many months ahead the report projects. */
export const FORECAST_MONTHS = 3;

/** The history the forecast rests on: the last 6 months (the month in progress is left out of the maths). */
export function forecastRange(today: string): DateRange {
  return presetRange("last-6-months", today);
}

/** A forecast needs at least this many complete months of history. */
export const MIN_HISTORY_MONTHS = 2;
/** Below this many months the report says the forecast rests on limited data. */
export const LIMITED_HISTORY_MONTHS = 6;
/** A category whose recent months differ from its older ones by less than this is "stable". */
export const STABLE_THRESHOLD = 0.05;
/** The trend applied to the forecast never exceeds this, so one unusual month cannot run away. */
export const MAX_TREND_FACTOR = 0.5;

export type Trend = "up" | "down" | "stable";

export type TrendResult = {
  /** Recent months against older months, e.g. 0.1 for +10%; null when the older months were zero. */
  change: number | null;
  direction: Trend;
  /** What the average is multiplied by: 1 + the change, limited to ±MAX_TREND_FACTOR (1 when stable). */
  factor: number;
};

/**
 * Compares the last third of the months with the first third (at least one month each; with six
 * months that is months 5-6 against months 1-2).
 */
export function trendOf(cents: number[]): TrendResult {
  const size = Math.max(1, Math.floor(cents.length / 3));
  const sum = (part: number[]) => part.reduce((total, value) => total + value, 0);
  const older = sum(cents.slice(0, size));
  const recent = sum(cents.slice(-size));
  if (older === 0) {
    return recent > 0
      ? { change: null, direction: "up", factor: 1 + MAX_TREND_FACTOR }
      : { change: 0, direction: "stable", factor: 1 };
  }
  const change = (recent - older) / older;
  if (Math.abs(change) < STABLE_THRESHOLD) return { change, direction: "stable", factor: 1 };
  const limited = Math.max(-MAX_TREND_FACTOR, Math.min(MAX_TREND_FACTOR, change));
  return { change, direction: change > 0 ? "up" : "down", factor: 1 + limited };
}

/**
 * The complete calendar months the period covers: the first and last month count only when the
 * period includes all of it and it is already over (a month in progress would pull averages down).
 */
export function completeMonths(range: DateRange, today: string): string[] {
  return monthStarts(range).filter((month) => {
    const { end } = monthRange(month);
    return month >= range.start && end <= range.end && end < today;
  });
}

/** Spending so far this year plus the average for the rest of it (the rest of this month included, pro rata). */
export function yearEndCents(ytdCents: number, averageCents: number, today: string): number {
  const { end } = monthRange(today);
  const daysInMonth = Number(end.slice(8, 10));
  const monthsLeft = 12 - Number(today.slice(5, 7)) + (daysInMonth - Number(today.slice(8, 10))) / daysInMonth;
  return ytdCents + Math.round(averageCents * monthsLeft);
}

export type CategorySeries = {
  key: string | null;
  name: string;
  color: string;
  icon: string | null;
  /** Spending in each of the history months, in cents. */
  cents: number[];
};

export type ForecastLine = CategorySeries & {
  lastCents: number;
  averageCents: number;
  /** The projected spending for each month ahead. */
  forecastCents: number;
  trend: TrendResult;
};

export function forecastLine(series: CategorySeries): ForecastLine {
  const total = series.cents.reduce((sum, value) => sum + value, 0);
  const averageCents = Math.round(total / series.cents.length);
  const trend = trendOf(series.cents);
  return {
    ...series,
    lastCents: series.cents.at(-1) ?? 0,
    averageCents,
    forecastCents: Math.round(averageCents * trend.factor),
    trend,
  };
}
