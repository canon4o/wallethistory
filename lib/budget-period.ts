import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Budget windows. A weekly budget covers the current week (Monday to Sunday), a monthly budget
// the current calendar month. All dates are `YYYY-MM-DD` strings (the format of a Postgres
// `date`). "Today" comes from the user's timezone; the range maths is in UTC so it never depends on
// the server's timezone.

export const BUDGET_PERIODS = ["weekly", "monthly"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export type DateRange = { start: string; end: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromISODate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Today's date in the given timezone (default UTC) as `YYYY-MM-DD`. */
export function todayISO(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  if (timezone === DEFAULT_TIMEZONE) return toISODate(now);
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    // en-CA formats dates as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timezone, formatter);
  }
  return formatter.format(now);
}

/** Monday to Sunday of the week containing `date`, both inclusive. */
export function weekRange(date: string): DateRange {
  const day = fromISODate(date);
  const sinceMonday = (day.getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const start = new Date(day.getTime() - sinceMonday * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return { start: toISODate(start), end: toISODate(end) };
}

/** First to last day of the calendar month containing `date`, both inclusive. */
export function monthRange(date: string): DateRange {
  const day = fromISODate(date);
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0));
  return { start: toISODate(start), end: toISODate(end) };
}

export function periodRange(period: BudgetPeriod, date: string): DateRange {
  return period === "weekly" ? weekRange(date) : monthRange(date);
}
