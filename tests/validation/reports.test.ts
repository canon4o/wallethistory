import { describe, expect, it } from "vitest";
import {
  carryFilterParams,
  hasActiveReportFilters,
  MAX_REPORT_MONTHS,
  parseComparison,
  parseReportFilters,
  parseReportType,
  reportFiltersToSearchParams,
} from "@/lib/validation/reports";
import { monthStarts } from "@/lib/reports/periods";

const TODAY = "2026-10-08";
const ID = "3f8b1c2e-9d4a-4b7e-8c1d-2a5f6e7d8c9b";

describe("parseReportFilters", () => {
  it("uses the preset when the URL has no period", () => {
    expect(parseReportFilters({}, "last-6-months", TODAY).range).toEqual({ start: "2026-05-01", end: "2026-10-31" });
    expect(parseReportFilters({}, "this-month", TODAY).range).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("reads the period and the other filters", () => {
    const filters = parseReportFilters(
      { from: "2026-01-01", to: "2026-03-31", account: ID, person: ID, category: "expense:Food", tag: " Trip ", q: " pay " },
      "this-month",
      TODAY,
    );
    expect(filters).toEqual({
      range: { start: "2026-01-01", end: "2026-03-31" },
      accountId: ID,
      personId: ID,
      category: "expense:Food",
      tag: "Trip",
      q: "pay",
    });
    expect(hasActiveReportFilters(filters)).toBe(true);
  });

  it("ignores invalid values instead of failing", () => {
    const filters = parseReportFilters(
      { from: "nope", to: "2026-02-30", account: "x", person: "y", category: "Food", tag: "", q: ["", "z"] },
      "this-month",
      TODAY,
    );
    expect(filters).toEqual({
      range: { start: "2026-10-01", end: "2026-10-31" },
      accountId: undefined,
      personId: undefined,
      category: undefined,
      tag: undefined,
      q: undefined,
    });
    expect(hasActiveReportFilters(filters)).toBe(false);
  });

  it("swaps a period that is the wrong way round and fills in a missing end", () => {
    expect(parseReportFilters({ from: "2026-03-31", to: "2026-01-01" }, "this-month", TODAY).range).toEqual({
      start: "2026-01-01",
      end: "2026-03-31",
    });
    expect(parseReportFilters({ from: "2026-08-01" }, "this-month", TODAY).range).toEqual({
      start: "2026-08-01",
      end: "2026-10-31",
    });
  });

  it("caps the period to the maximum number of months, keeping the end", () => {
    const { range } = parseReportFilters({ from: "2000-01-01", to: "2026-10-31" }, "this-month", TODAY);
    expect(range.end).toBe("2026-10-31");
    expect(monthStarts(range)).toHaveLength(MAX_REPORT_MONTHS);
  });

  it("round-trips through the query string", () => {
    const filters = parseReportFilters({ from: "2026-01-01", to: "2026-03-31", category: "income:Salary", q: "a b" }, "this-month", TODAY);
    const params = reportFiltersToSearchParams(filters);
    expect(Object.fromEntries(params)).toEqual({ from: "2026-01-01", to: "2026-03-31", category: "income:Salary", q: "a b" });
    expect(parseReportFilters(Object.fromEntries(params), "this-month", TODAY)).toEqual(filters);
  });
});

describe("carryFilterParams", () => {
  it("keeps the narrowing filters but not the period", () => {
    const filters = parseReportFilters({ from: "2026-01-01", to: "2026-03-31", account: ID, tag: "Trip" }, "this-month", TODAY);
    expect(Object.fromEntries(carryFilterParams(filters))).toEqual({ account: ID, tag: "Trip" });
  });
});

describe("parseReportType", () => {
  it("defaults to expenses", () => {
    expect(parseReportType({})).toBe("expense");
    expect(parseReportType({ type: "income" })).toBe("income");
    expect(parseReportType({ type: "transfer" })).toBe("expense");
  });
});

describe("parseComparison", () => {
  it("compares this month with last month by default", () => {
    expect(parseComparison({}, TODAY)).toEqual({
      mode: "month",
      a: "2026-10",
      b: "2026-09",
      aRange: { start: "2026-10-01", end: "2026-10-31" },
      bRange: { start: "2026-09-01", end: "2026-09-30" },
    });
  });

  it("compares this year with last year in year mode", () => {
    expect(parseComparison({ mode: "year" }, TODAY)).toMatchObject({
      mode: "year",
      a: "2026",
      b: "2025",
      aRange: { start: "2026-01-01", end: "2026-12-31" },
      bRange: { start: "2025-01-01", end: "2025-12-31" },
    });
  });

  it("reads two chosen periods and falls back for invalid ones", () => {
    expect(parseComparison({ a: "2026-02", b: "2025-02" }, TODAY)).toMatchObject({
      aRange: { start: "2026-02-01", end: "2026-02-28" },
      bRange: { start: "2025-02-01", end: "2025-02-28" },
    });
    expect(parseComparison({ mode: "year", a: "2024", b: "1900" }, TODAY)).toMatchObject({ a: "2024", b: "2025" });
    expect(parseComparison({ a: "2026-13", b: "nope" }, TODAY)).toMatchObject({ a: "2026-10", b: "2026-09" });
    expect(parseComparison({ mode: "weird" }, TODAY).mode).toBe("month");
  });
});
