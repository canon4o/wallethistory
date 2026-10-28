import { describe, expect, it } from "vitest";
import {
  currencySymbol,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatDayRange,
  formatDelta,
  formatMonth,
  formatMoney,
  formatMonthYear,
  formatPercent,
  formatPercentChange,
  formatShortMonth,
  formatTransactionAmount,
} from "@/lib/format";
import { translator } from "@/lib/i18n/translate";

describe("format", () => {
  it("formats a timestamp in UTC", () => {
    expect(formatDateTime(new Date("2026-10-10T17:26:00Z"))).toBe("Oct 10, 2026, 17:26 UTC");
  });

  it("formats a timestamp in another timezone", () => {
    expect(formatDateTime(new Date("2026-10-10T17:26:00Z"), "America/New_York")).toBe("Oct 10, 2026, 13:26 EDT");
    expect(formatDateTime(new Date("2026-10-10T17:26:00Z"), "Asia/Tokyo")).toBe("Oct 11, 2026, 02:26 GMT+9");
  });

  it("writes midnight as 00:00, never 24:00", () => {
    expect(formatDateTime(new Date("2026-10-10T00:05:00Z"))).toBe("Oct 10, 2026, 00:05 UTC");
  });

  it("uses a $ symbol for USD and a € symbol for EUR", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(1234.5, "EUR")).toBe("€1,234.50");
    expect(formatMoney(-5, "EUR")).toBe("-€5.00");
    expect(formatTransactionAmount(10, "income", "EUR")).toBe("+€10.00");
    expect(formatTransactionAmount(10, "transfer", "EUR")).toBe("€10.00");
    expect(formatDelta(-3, "EUR")).toBe("-€3.00");
    expect(formatDelta(0, "EUR")).toBe("€0.00");
    expect(formatCompactMoney(1234, "EUR")).toBe("€1.2K");
  });

  it("formats money with grouping and two decimals", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-5)).toBe("-$5.00");
  });

  it("signs only income; expenses and transfers have no sign", () => {
    expect(formatTransactionAmount(10, "income")).toBe("+$10.00");
    expect(formatTransactionAmount(10, "expense")).toBe("$10.00");
    expect(formatTransactionAmount(-10, "expense")).toBe("$10.00");
    expect(formatTransactionAmount(10, "transfer")).toBe("$10.00");
  });

  it("formats ISO dates without timezone shifts", () => {
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("formats a difference with an explicit sign", () => {
    expect(formatDelta(10)).toBe("+$10.00");
    expect(formatDelta(-1234.5)).toBe("-$1,234.50");
    expect(formatDelta(0)).toBe("$0.00");
    expect(formatDelta(-0)).toBe("$0.00");
  });

  it("formats day ranges for captions", () => {
    expect(formatDayRange("2026-09-01", "2026-09-10")).toBe("Sep 1-10");
    expect(formatDayRange("2026-09-28", "2026-10-03")).toBe("Sep 28 - Oct 3");
    expect(formatDayRange("2026-09-05", "2026-09-05")).toBe("Sep 5");
  });

  it("formats report values", () => {
    expect(formatCompactMoney(1234)).toBe("$1.2K");
    expect(formatCompactMoney(-2_500_000)).toBe("-$2.5M");
    expect(formatShortMonth("2026-10-01")).toBe("Oct 26");
    expect(formatMonthYear("2026-10-01")).toBe("Oct 2026");
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercentChange(0.25)).toBe("+25.0%");
    expect(formatPercentChange(-0.1)).toBe("-10.0%");
    expect(formatPercentChange(0)).toBe("0.0%");
    expect(formatPercentChange(-0.00001)).toBe("0.0%");
  });

  it.each([
    ["bg", "10 окт 2026", "Октомври 2026", "окт 26", "окт 2026", "1-10 сеп", "28 сеп - 3 окт", "10 окт 2026, 17:26 UTC"],
    ["es", "10 oct 2026", "Octubre 2026", "oct 26", "oct 2026", "1-10 sep", "28 sep - 3 oct", "10 oct 2026, 17:26 UTC"],
  ] as const)("writes dates with short translated months (%s)", (locale, date, month, short, monthYear, range, longRange, dateTime) => {
    const t = translator(locale);
    expect(formatDate("2026-10-10", t)).toBe(date);
    expect(formatMonth("2026-10-01", t)).toBe(month);
    expect(formatShortMonth("2026-10-01", t)).toBe(short);
    expect(formatMonthYear("2026-10-01", t)).toBe(monthYear);
    expect(formatDayRange("2026-09-01", "2026-09-10", t)).toBe(range);
    expect(formatDayRange("2026-09-28", "2026-10-03", t)).toBe(longRange);
    expect(formatDayRange("2026-09-05", "2026-09-05", t)).toBe(locale === "bg" ? "5 сеп" : "5 sep");
    expect(formatDateTime(new Date("2026-10-10T17:26:00Z"), "UTC", t)).toBe(dateTime);
    expect(formatDateTime(new Date("2026-10-10T00:05:00Z"), "UTC", t)).toBe(dateTime.replace("17:26", "00:05"));
  });
});
