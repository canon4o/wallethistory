import { msg } from "@/lib/i18n/translate";
// Date helpers for reports. Like lib/budget-period.ts, everything is a `YYYY-MM-DD` string and
// is calculated in UTC, so the result never depends on the server's timezone.

import { monthRange, type DateRange } from "@/lib/budget-period";

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return format(new Date(parse(date).getTime() + days * DAY_MS));
}

/** The first day of the month `months` months after (or before, if negative) the month of `date`. */
export function addMonths(date: string, months: number): string {
  const day = parse(date);
  return format(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + months, 1)));
}

/** Whole days from `start` to `end`, both inclusive. */
export function daysInRange(range: DateRange): number {
  return Math.round((parse(range.end).getTime() - parse(range.start).getTime()) / DAY_MS) + 1;
}

/** The first day of every month the range touches, oldest first. */
export function monthStarts(range: DateRange): string[] {
  const months: string[] = [];
  for (let month = monthRange(range.start).start; month <= range.end; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

/** How many calendar months a range made of whole months covers, or null for any other range. */
export function wholeMonths(range: DateRange): number | null {
  const first = monthRange(range.start);
  const last = monthRange(range.end);
  if (range.start !== first.start || range.end !== last.end) return null;
  return monthStarts(range).length;
}

/**
 * The period right before `range`, for "change vs. last period". Whole calendar months compare
 * with the same number of whole months before (March is compared with February, not with the
 * last 31 days); any other range compares with the same number of days before it.
 */
export function previousRange(range: DateRange): DateRange {
  const months = wholeMonths(range);
  if (months !== null) {
    const start = addMonths(range.start, -months);
    return { start, end: addDays(range.start, -1) };
  }
  const days = daysInRange(range);
  return { start: addDays(range.start, -days), end: addDays(range.start, -1) };
}

export const PERIOD_PRESETS = [
  { id: "this-month", label: msg("This month") },
  { id: "last-month", label: msg("Last month") },
  { id: "last-3-months", label: msg("Last 3 months") },
  { id: "last-6-months", label: msg("Last 6 months") },
  { id: "last-12-months", label: msg("Last 12 months") },
  { id: "this-year", label: msg("This year") },
  { id: "last-year", label: msg("Last year") },
] as const;

export type PeriodPresetId = (typeof PERIOD_PRESETS)[number]["id"];

/** A preset's date range relative to `today`. Rolling presets end with the current month. */
export function presetRange(id: PeriodPresetId, today: string): DateRange {
  const thisMonth = monthRange(today);
  const year = today.slice(0, 4);
  switch (id) {
    case "this-month":
      return thisMonth;
    case "last-month":
      return monthRange(addMonths(today, -1));
    case "last-3-months":
      return { start: addMonths(today, -2), end: thisMonth.end };
    case "last-6-months":
      return { start: addMonths(today, -5), end: thisMonth.end };
    case "last-12-months":
      return { start: addMonths(today, -11), end: thisMonth.end };
    case "this-year":
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    case "last-year":
      return { start: `${Number(year) - 1}-01-01`, end: `${Number(year) - 1}-12-31` };
  }
}

/** The preset that produces exactly `range` today, if any (to highlight it). */
export function matchingPreset(range: DateRange, today: string): PeriodPresetId | null {
  for (const preset of PERIOD_PRESETS) {
    const candidate = presetRange(preset.id, today);
    if (candidate.start === range.start && candidate.end === range.end) return preset.id;
  }
  return null;
}
