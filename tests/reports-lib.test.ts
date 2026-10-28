import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/reports/csv";
import { changeRatio, fromCents, savingsRate, toCents } from "@/lib/reports/money";
import {
  addDays,
  addMonths,
  daysInRange,
  matchingPreset,
  monthStarts,
  PERIOD_PRESETS,
  presetRange,
  previousRange,
  wholeMonths,
} from "@/lib/reports/periods";

describe("report money", () => {
  it("converts between numeric text and whole cents without drift", () => {
    expect(toCents("1234.50")).toBe(123450);
    expect(toCents("0.30") + toCents("0.60")).toBe(90);
    expect(fromCents(123450)).toBe("1234.50");
    expect(fromCents(-5)).toBe("-0.05");
  });

  it("calculates the savings rate and the change", () => {
    expect(savingsRate(10000, 7500)).toBe(0.25);
    expect(savingsRate(10000, 12000)).toBe(-0.2);
    expect(savingsRate(0, 500)).toBeNull();
    expect(changeRatio(150, 100)).toBe(0.5);
    expect(changeRatio(50, 100)).toBe(-0.5);
    expect(changeRatio(50, 0)).toBeNull();
  });
});

describe("report periods", () => {
  it("adds days and months in UTC", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-10-15", 1)).toBe("2026-11-01");
    expect(addMonths("2026-01-31", -2)).toBe("2025-11-01");
  });

  it("counts days and lists the months a range touches", () => {
    expect(daysInRange({ start: "2026-10-01", end: "2026-10-31" })).toBe(31);
    expect(daysInRange({ start: "2026-10-05", end: "2026-10-05" })).toBe(1);
    expect(monthStarts({ start: "2026-08-20", end: "2026-10-02" })).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(monthStarts({ start: "2026-10-05", end: "2026-10-05" })).toEqual(["2026-10-01"]);
  });

  it("recognises ranges made of whole months", () => {
    expect(wholeMonths({ start: "2026-07-01", end: "2026-09-30" })).toBe(3);
    expect(wholeMonths({ start: "2026-07-02", end: "2026-09-30" })).toBeNull();
    expect(wholeMonths({ start: "2026-07-01", end: "2026-09-29" })).toBeNull();
  });

  it("compares whole months with the same number of months before, anything else with the same days", () => {
    expect(previousRange({ start: "2026-03-01", end: "2026-03-31" })).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousRange({ start: "2026-01-01", end: "2026-12-31" })).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(previousRange({ start: "2026-07-01", end: "2026-09-30" })).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(previousRange({ start: "2026-10-08", end: "2026-10-14" })).toEqual({ start: "2026-10-01", end: "2026-10-07" });
  });

  it("builds presets relative to today", () => {
    const today = "2026-10-08";
    expect(presetRange("this-month", today)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(presetRange("last-month", today)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(presetRange("last-3-months", today)).toEqual({ start: "2026-08-01", end: "2026-10-31" });
    expect(presetRange("last-6-months", today)).toEqual({ start: "2026-05-01", end: "2026-10-31" });
    expect(presetRange("last-12-months", today)).toEqual({ start: "2025-11-01", end: "2026-10-31" });
    expect(presetRange("this-year", today)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(presetRange("last-year", today)).toEqual({ start: "2025-01-01", end: "2025-12-31" });
  });

  it("finds the preset that matches a range", () => {
    for (const preset of PERIOD_PRESETS) {
      expect(matchingPreset(presetRange(preset.id, "2026-10-08"), "2026-10-08")).toBe(preset.id);
    }
    expect(matchingPreset({ start: "2026-10-02", end: "2026-10-09" }, "2026-10-08")).toBeNull();
  });
});

describe("toCsv", () => {
  it("writes rows with CRLF line endings and two-decimal numbers", () => {
    expect(toCsv([["Month", "Net"], ["2026-10", -12.5], ["x", null]])).toBe("Month,Net\r\n2026-10,-12.50\r\nx,\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv([['Food, "fast"', "a\nb"]])).toBe('"Food, ""fast""","a\nb"\r\n');
  });

  it("defuses text that spreadsheets would run as a formula, but not numbers", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "ok", -3]])).toBe("'=SUM(A1),'+1,'-1,'@cmd,'\tx,ok,-3.00\r\n");
  });
});
