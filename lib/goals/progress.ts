// Goal maths in whole cents (database sums arrive as numeric(14,2) text), so totals stay exact.

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.4375;

export type GoalProgress = {
  /** Saved as a share of the target, 0 to 100 (capped, rounded down so 99.9% never shows as done). */
  percent: number;
  /** What is still missing; 0 once the target is reached. */
  remainingCents: number;
  /** Saved is at or above the target. */
  completed: boolean;
  /** Whole days from today to the deadline, or null without a deadline. Negative when it has passed. */
  daysLeft: number | null;
  /** The deadline is in the past and the goal is not complete. */
  overdue: boolean;
  /** What to put aside each month to reach the target by the deadline, or null when it does not apply. */
  monthlyNeededCents: number | null;
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export function goalProgress(input: {
  savedCents: number;
  targetCents: number;
  deadline: string | null;
  today: string;
}): GoalProgress {
  const { savedCents, targetCents, deadline, today } = input;
  const completed = savedCents >= targetCents;
  const remainingCents = Math.max(0, targetCents - savedCents);
  const percent = targetCents > 0 ? Math.min(100, Math.max(0, Math.floor((savedCents / targetCents) * 100))) : 0;
  const daysLeft = deadline ? daysBetween(today, deadline) : null;
  const overdue = !completed && daysLeft !== null && daysLeft < 0;
  const monthlyNeededCents =
    completed || daysLeft === null || daysLeft < 0
      ? null
      : Math.ceil(remainingCents / Math.max(1, Math.ceil(daysLeft / DAYS_PER_MONTH)));
  return { percent, remainingCents, completed, daysLeft, overdue, monthlyNeededCents };
}

/** Cumulative saved amount after each day that had a movement, for the history chart. */
export function buildSavedSeries(
  movements: Array<{ date: string; deltaCents: number }>,
): Array<{ date: string; savedCents: number }> {
  const byDate = new Map<string, number>();
  for (const { date, deltaCents } of movements) byDate.set(date, (byDate.get(date) ?? 0) + deltaCents);
  let running = 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, delta]) => {
      running += delta;
      return { date, savedCents: running };
    });
}

/** Net deposits over the last 90 days divided by 3: what the goal gets in a typical recent month. */
export function recentMonthlyPaceCents(
  movements: Array<{ date: string; deltaCents: number }>,
  today: string,
): number {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * MS_PER_DAY).toISOString().slice(0, 10);
  const net = movements.filter((m) => m.date > cutoff && m.date <= today).reduce((sum, m) => sum + m.deltaCents, 0);
  return Math.max(0, Math.round(net / 3));
}
