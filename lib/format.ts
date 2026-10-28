import { CURRENCIES, DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currencies";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { Translate } from "@/lib/i18n/translate";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

/** Symbol of a currency, e.g. "$" or "€" (for input prefixes and hints). */
export function currencySymbol(currency: CurrencyCode): string {
  return CURRENCIES.find((item) => item.code === currency)?.symbol ?? currency;
}

// Amounts always use en-US grouping, whatever the interface language; only the currency symbol changes.
const moneyFormatters = new Map<string, Intl.NumberFormat>();
const compactMoneyFormatters = new Map<string, Intl.NumberFormat>();

/** Formats a positive or negative amount, e.g. 1234.5 -> "$1,234.50" (or "€1,234.50"). */
export function formatMoney(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

/** Formats an amount for list rows: income gets a "+" ("+$10.00"); expenses and transfers have no sign ("$10.00"). */
export function formatTransactionAmount(
  amount: number,
  type: "income" | "expense" | "transfer",
  currency: CurrencyCode = DEFAULT_CURRENCY,
): string {
  return `${type === "income" ? "+" : ""}${formatMoney(Math.abs(amount), currency)}`;
}

/** Month names for the non-English languages (short ones are always three letters). */
const MONTHS: Record<Exclude<Locale, "en">, { short: string[]; long: string[] }> = {
  bg: {
    short: ["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"],
    long: ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"],
  },
  es: {
    short: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    long: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  },
};

function localeOf(t?: Translate): Locale {
  return t?.locale ?? DEFAULT_LOCALE;
}

/** The parts of a `YYYY-MM-DD` date. */
function parts(isoDate: string) {
  return { year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) - 1, day: Number(isoDate.slice(8, 10)) };
}

const enDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Formats a `YYYY-MM-DD` date string (Postgres `date`) without timezone shifts: "Oct 10, 2026" in
 * English, "10 окт 2026" in Bulgarian, "10 oct 2026" in Spanish.
 */
export function formatDate(isoDate: string, t?: Translate): string {
  const locale = localeOf(t);
  if (locale === "en") return enDateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
  const { year, month, day } = parts(isoDate);
  return `${day} ${MONTHS[locale].short[month]} ${year}`;
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Formats a timestamp in the given timezone, e.g. "Oct 10, 2026, 17:26 UTC" or
 * "Oct 10, 2026, 20:26 GMT+3" (server and browser agree).
 */
export function formatDateTime(date: Date, timezone: string = DEFAULT_TIMEZONE, t?: Translate): string {
  let formatter = dateTimeFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
      timeZoneName: "short",
    });
    dateTimeFormatters.set(timezone, formatter);
  }
  const locale = localeOf(t);
  if (locale === "en") return formatter.format(date);
  const found = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const month = MONTHS[locale].short[new Date(`${found.month} 1, 2000`).getMonth()];
  const hour = found.hour === "24" ? "00" : found.hour;
  return `${found.day} ${month} ${found.year}, ${hour}:${found.minute} ${found.timeZoneName}`;
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** Formats a `YYYY-MM-DD` date as its month, e.g. "October 2026". */
export function formatMonth(isoDate: string, t?: Translate): string {
  const locale = localeOf(t);
  if (locale === "en") return monthFormatter.format(new Date(`${isoDate}T00:00:00Z`));
  const { year, month } = parts(isoDate);
  const name = MONTHS[locale].long[month];
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

/** Formats a difference with an explicit sign: "+$10.00", "-$10.00", or "$0.00" for zero. */
export function formatDelta(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  if (amount === 0) return formatMoney(0, currency);
  return `${amount > 0 ? "+" : "-"}${formatMoney(Math.abs(amount), currency)}`;
}

/** Short money for chart axes, e.g. 1234 -> "$1.2K". */
export function formatCompactMoney(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  let formatter = compactMoneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    compactMoneyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

const shortMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** Formats a `YYYY-MM-DD` date as a short month for chart axes, e.g. "Oct 26". */
export function formatShortMonth(isoDate: string, t?: Translate): string {
  const locale = localeOf(t);
  if (locale === "en") return shortMonthFormatter.format(new Date(`${isoDate}T00:00:00Z`));
  const { year, month } = parts(isoDate);
  return `${MONTHS[locale].short[month]} ${String(year).slice(2)}`;
}

const monthYearFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats a `YYYY-MM-DD` date as month and year, e.g. "Oct 2026". */
export function formatMonthYear(isoDate: string, t?: Translate): string {
  const locale = localeOf(t);
  if (locale === "en") return monthYearFormatter.format(new Date(`${isoDate}T00:00:00Z`));
  const { year, month } = parts(isoDate);
  return `${MONTHS[locale].short[month]} ${year}`;
}

/** A ratio as a percentage with one decimal: 0.1234 -> "12.3%". */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** A change with an explicit sign: 0.25 -> "+25.0%", -0.1 -> "-10.0%", 0 -> "0.0%". */
export function formatPercentChange(ratio: number): string {
  const text = formatPercent(Math.abs(ratio));
  if (Number(text.slice(0, -1)) === 0) return "0.0%";
  return `${ratio > 0 ? "+" : "-"}${text}`;
}

const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A day range for captions: "Sep 1-10" within one month, "Sep 28 - Oct 3" across two. */
export function formatDayRange(start: string, end: string, t?: Translate): string {
  const locale = localeOf(t);
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (locale !== "en") {
    const a = parts(start);
    const b = parts(end);
    const short = (value: { month: number; day: number }) => `${value.day} ${MONTHS[locale].short[value.month]}`;
    if (start === end) return short(a);
    if (start.slice(0, 7) === end.slice(0, 7)) return `${a.day}-${b.day} ${MONTHS[locale].short[a.month]}`;
    return `${short(a)} - ${short(b)}`;
  }
  if (start === end) return dayFormatter.format(from);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${dayFormatter.format(from)}-${to.getUTCDate()}`;
  return `${dayFormatter.format(from)} - ${dayFormatter.format(to)}`;
}
