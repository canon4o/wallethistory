export const DEFAULT_TIMEZONE = "UTC";

/**
 * The canonical IANA name for a timezone, or null when it is not valid. Accepts any case
 * ("europe/sofia") and returns the canonical spelling ("Europe/Sofia").
 */
export function normalizeTimezone(value: string): string | null {
  if (value.length === 0 || value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** A valid stored timezone, or the default when the value is empty or not valid. */
export function toTimezone(value: string | null | undefined): string {
  return (value ? normalizeTimezone(value) : null) ?? DEFAULT_TIMEZONE;
}

/** All timezone names the runtime knows, UTC first. Pass the result to client components as a prop. */
export function listTimezones(): string[] {
  const names = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [DEFAULT_TIMEZONE, ...names.filter((name) => name !== DEFAULT_TIMEZONE)];
}

/** "UTC+02:00" style offset of a timezone right now, for the settings hint. */
export function timezoneOffsetLabel(timezone: string, now: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
    .formatToParts(now)
    .find((item) => item.type === "timeZoneName")?.value;
  if (!part || part === "GMT") return "UTC+00:00";
  return part.replace("GMT", "UTC");
}
