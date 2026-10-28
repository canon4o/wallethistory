// Occurrence dates of a recurring rule. All dates are `YYYY-MM-DD` strings (the format of a
// Postgres `date`) and are calculated in UTC so the result never depends on the server's timezone.
//
// Occurrence n of a rule is computed from its start date, never from the previous occurrence, so
// a monthly rule that starts on the 31st gives Jan 31, Feb 28, Mar 31 (the day is clamped, not
// carried forward) and a yearly rule that starts on Feb 29 gives Feb 28 in non-leap years.

export const RECURRING_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export type Schedule = {
  frequency: RecurringFrequency;
  /** "Every N" days, weeks, months or years. At least 1. */
  intervalCount: number;
  /** The first occurrence. */
  startDate: string;
};

/** Rules whose next occurrence is older than this many years are paused instead of caught up. */
export const STALE_YEARS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utc(value: string): number {
  return new Date(`${value}T00:00:00Z`).getTime();
}

export function addDays(value: string, days: number): string {
  return format(new Date(utc(value) + days * DAY_MS));
}

/** `value` shifted by whole months, clamping the day to the target month's length. */
function addMonths(value: string, months: number, day: number): string {
  const { year, month } = parse(value);
  const total = year * 12 + month + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return format(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))));
}

/** `today` minus the stale window. A rule whose next date is earlier than this is stale. */
export function staleCutoff(today: string): string {
  return addMonths(today, -STALE_YEARS * 12, parse(today).day);
}

function dayStep(schedule: Schedule): number | null {
  if (schedule.frequency === "daily") return schedule.intervalCount;
  if (schedule.frequency === "weekly") return 7 * schedule.intervalCount;
  return null;
}

function monthStep(schedule: Schedule): number {
  return (schedule.frequency === "yearly" ? 12 : 1) * schedule.intervalCount;
}

/** Whole months from `from` to `to` (ignoring the day of the month). */
function monthsBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Occurrence number `n` (0 = the start date). */
export function occurrenceAt(schedule: Schedule, n: number): string {
  const days = dayStep(schedule);
  if (days !== null) return addDays(schedule.startDate, n * days);
  return addMonths(schedule.startDate, n * monthStep(schedule), parse(schedule.startDate).day);
}

/** The occurrence after `current`, which must itself be an occurrence of the schedule. */
export function nextOccurrence(schedule: Schedule, current: string): string {
  const days = dayStep(schedule);
  if (days !== null) return addDays(current, days);
  return occurrenceAt(schedule, monthsBetween(schedule.startDate, current) / monthStep(schedule) + 1);
}

/** The first occurrence on or after `date` (the start date when `date` is earlier). */
export function firstOccurrenceOnOrAfter(schedule: Schedule, date: string): string {
  if (date <= schedule.startDate) return schedule.startDate;
  const days = dayStep(schedule);
  let n =
    days !== null
      ? Math.ceil((utc(date) - utc(schedule.startDate)) / DAY_MS / days)
      : Math.ceil(monthsBetween(schedule.startDate, date) / monthStep(schedule));
  // Day clamping can put occurrence n a few days before `date` within the same month.
  while (occurrenceAt(schedule, n) < date) n += 1;
  return occurrenceAt(schedule, n);
}

/**
 * Every occurrence from `from` (an occurrence) up to and including `until`, and the first one
 * after that. `until` is the earlier of today and the rule's end date.
 */
export function occurrencesUntil(
  schedule: Schedule,
  from: string,
  until: string,
): { dates: string[]; next: string } {
  const dates: string[] = [];
  let current = from;
  while (current <= until) {
    dates.push(current);
    current = nextOccurrence(schedule, current);
  }
  return { dates, next: current };
}
