import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import type { Translate } from "@/lib/i18n/translate";

const hourFormatters = new Map<string, Intl.DateTimeFormat>();

/** The hour of day (0-23) in the given timezone. */
function hourIn(timezone: string, now: Date): number {
  let formatter = hourFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" });
    hourFormatters.set(timezone, formatter);
  }
  return Number(formatter.format(now)) % 24;
}

/** A time-aware greeting for the dashboard title, using the first word of the user's name when there is one. */
export function greeting(t: Translate, name: string, timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  const hour = hourIn(timezone, now);
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (hour >= 5 && hour < 12) return first ? t("Good morning, {name}", { name: first }) : t("Good morning");
  if (hour >= 12 && hour < 18) return first ? t("Good afternoon, {name}", { name: first }) : t("Good afternoon");
  return first ? t("Good evening, {name}", { name: first }) : t("Good evening");
}
