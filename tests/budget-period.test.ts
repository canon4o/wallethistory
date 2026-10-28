import { describe, expect, it } from "vitest";
import { monthRange, periodRange, todayISO, weekRange } from "@/lib/budget-period";
import { formatMonth } from "@/lib/format";

describe("weekRange (Monday to Sunday)", () => {
  it("returns the Monday and Sunday around any day of the week", () => {
    // 2026-10-05 is a Monday, 2026-10-11 a Sunday.
    const week = { start: "2026-10-05", end: "2026-10-11" };
    for (const day of ["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-10", "2026-10-11"]) {
      expect(weekRange(day), day).toEqual(week);
    }
  });

  it("starts a new week on Monday and ends the old one on Sunday", () => {
    expect(weekRange("2026-10-04")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekRange("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
  });

  it("crosses month and year boundaries", () => {
    expect(weekRange("2026-01-01")).toEqual({ start: "2025-12-29", end: "2026-01-04" });
    expect(weekRange("2026-03-01")).toEqual({ start: "2026-02-23", end: "2026-03-01" });
    expect(weekRange("2024-03-01")).toEqual({ start: "2024-02-26", end: "2024-03-03" });
  });
});

describe("monthRange (calendar month)", () => {
  it("returns the first and last day of the month", () => {
    expect(monthRange("2026-10-08")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthRange("2026-10-01")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthRange("2026-10-31")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthRange("2026-04-15")).toEqual({ start: "2026-04-01", end: "2026-04-30" });
  });

  it("handles February in leap and non-leap years, and December", () => {
    expect(monthRange("2026-02-10").end).toBe("2026-02-28");
    expect(monthRange("2024-02-10").end).toBe("2024-02-29");
    expect(monthRange("2100-02-10").end).toBe("2100-02-28");
    expect(monthRange("2026-12-31")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});

describe("periodRange and todayISO", () => {
  it("picks the window by period", () => {
    expect(periodRange("weekly", "2026-10-08")).toEqual(weekRange("2026-10-08"));
    expect(periodRange("monthly", "2026-10-08")).toEqual(monthRange("2026-10-08"));
  });

  it("formats today in UTC, independent of the server timezone", () => {
    expect(todayISO("UTC", new Date("2026-10-08T23:59:59Z"))).toBe("2026-10-08");
    expect(todayISO("UTC", new Date("2026-10-09T00:00:00Z"))).toBe("2026-10-09");
    expect(todayISO("UTC", new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-08");
    expect(todayISO("Pacific/Kiritimati", new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
    expect(todayISO("America/Los_Angeles", new Date("2026-10-09T05:30:00Z"))).toBe("2026-10-08");
    expect(todayISO("Europe/Sofia", new Date("2026-10-08T20:59:00Z"))).toBe("2026-10-08");
    expect(todayISO("Europe/Sofia", new Date("2026-10-08T21:00:00Z"))).toBe("2026-10-09");
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatMonth", () => {
  it("names the month and year", () => {
    expect(formatMonth("2026-10-01")).toBe("October 2026");
    expect(formatMonth("2026-01-31")).toBe("January 2026");
  });
});
