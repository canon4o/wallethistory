import type { DateRange } from "./budget-period";
import { addDays, occurrencesUntil, type Schedule } from "./recurring/dates";

// Recurring expenses that are still to come inside a budget's period, in whole cents: only
// occurrences after today. Earlier ones are already transactions and part of the spending. Pure
// logic (no database), like lib/budget-pace.ts.

export type PlannedRule = Schedule & {
  amountCents: number;
  endDate: string | null;
  /** The next occurrence still to be created (an occurrence of the schedule). */
  nextDueDate: string;
};

/** What the active rules will still add to the period: their occurrences after `today`, up to the end of `range` (or of the rule). */
export function plannedCents(rules: PlannedRule[], range: DateRange, today: string): number {
  const from = range.start > today ? range.start : addDays(today, 1);
  let total = 0;
  for (const rule of rules) {
    const until = rule.endDate !== null && rule.endDate < range.end ? rule.endDate : range.end;
    if (rule.nextDueDate > until) continue;
    const { dates } = occurrencesUntil(rule, rule.nextDueDate, until);
    total += dates.filter((date) => date >= from).length * rule.amountCents;
  }
  return total;
}
