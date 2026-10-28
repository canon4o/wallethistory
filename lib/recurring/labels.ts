import type { RecurringRuleItem } from "@/lib/data/recurring";
import { msg, type Translate } from "@/lib/i18n/translate";
import type { RecurringFrequency } from "./dates";

export const FREQUENCY_OPTIONS: Array<{ value: RecurringFrequency; label: string }> = [
  { value: "daily", label: msg("Day(s)") },
  { value: "weekly", label: msg("Week(s)") },
  { value: "monthly", label: msg("Month(s)") },
  { value: "yearly", label: msg("Year(s)") },
];

const SCHEDULES: Record<RecurringFrequency, [string, string]> = {
  daily: [msg("Every day"), msg("{count, plural, one {Every # day} other {Every # days}}")],
  weekly: [msg("Every week"), msg("{count, plural, one {Every # week} other {Every # weeks}}")],
  monthly: [msg("Every month"), msg("{count, plural, one {Every # month} other {Every # months}}")],
  yearly: [msg("Every year"), msg("{count, plural, one {Every # year} other {Every # years}}")],
};

/** "Every day", "Every 2 weeks". */
export function describeSchedule(frequency: RecurringFrequency, intervalCount: number, t: Translate): string {
  const [single, many] = SCHEDULES[frequency];
  return intervalCount === 1 ? t(single) : t(many, { count: intervalCount });
}

/** "Active", "Paused", "Ended", with the reason a rule was paused. */
export function describeStatus(
  status: "active" | "paused" | "ended",
  pausedReason: "manual" | "stale" | "household_link" | "goal_closed" | null,
  t: Translate,
): string {
  if (status === "active") return t("Active");
  if (status === "ended") return t("Ended");
  if (pausedReason === "stale") return t("Paused: not used for over 2 years");
  if (pausedReason === "household_link") return t("Paused: the destination is no longer shared with you");
  if (pausedReason === "goal_closed") return t("Paused: the goal is no longer open");
  return t("Paused");
}

/** What the rule creates, in one line: "Groceries · Cash", "Cash → Bank". */
export function describeRule(rule: RecurringRuleItem, t: Translate): string {
  if (rule.kind === "transfer") return `${rule.fromAccountName ?? t("Account")} → ${rule.toAccountName ?? t("Account")}`;
  if (rule.kind === "goal") return `${rule.accountName ?? t("Account")} → ${rule.goalName ?? t("Goal")}`;
  return [rule.categoryName ?? t("Uncategorized"), rule.accountName].filter(Boolean).join(" · ");
}
