import { describe, expect, it } from "vitest";
import {
  addDays,
  firstOccurrenceOnOrAfter,
  nextOccurrence,
  occurrenceAt,
  occurrencesUntil,
  staleCutoff,
  type Schedule,
} from "@/lib/recurring/dates";

const schedule = (frequency: Schedule["frequency"], startDate: string, intervalCount = 1): Schedule => ({
  frequency,
  intervalCount,
  startDate,
});

describe("recurring dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("steps daily and weekly rules by the interval", () => {
    expect(nextOccurrence(schedule("daily", "2026-01-30"), "2026-01-30")).toBe("2026-01-31");
    expect(nextOccurrence(schedule("daily", "2026-01-30", 3), "2026-01-30")).toBe("2026-02-02");
    expect(nextOccurrence(schedule("weekly", "2026-01-05", 2), "2026-01-05")).toBe("2026-01-19");
  });

  it("clamps monthly rules to the end of short months without drifting", () => {
    const monthly = schedule("monthly", "2026-01-31");
    const dates = Array.from({ length: 5 }, (_, n) => occurrenceAt(monthly, n));
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(nextOccurrence(monthly, "2026-02-28")).toBe("2026-03-31");
  });

  it("handles every-N-months and year boundaries", () => {
    const quarterly = schedule("monthly", "2026-11-15", 3);
    expect(nextOccurrence(quarterly, "2026-11-15")).toBe("2027-02-15");
    expect(nextOccurrence(quarterly, "2027-02-15")).toBe("2027-05-15");
  });

  it("repeats a yearly rule on a leap day as Feb 28 in other years", () => {
    const yearly = schedule("yearly", "2024-02-29");
    expect(nextOccurrence(yearly, "2024-02-29")).toBe("2025-02-28");
    expect(nextOccurrence(yearly, "2027-02-28")).toBe("2028-02-29");
    expect(occurrenceAt(schedule("yearly", "2026-06-10", 2), 1)).toBe("2028-06-10");
  });

  it("finds the first occurrence on or after a date", () => {
    const monthly = schedule("monthly", "2026-01-31");
    expect(firstOccurrenceOnOrAfter(monthly, "2025-12-01")).toBe("2026-01-31");
    expect(firstOccurrenceOnOrAfter(monthly, "2026-02-10")).toBe("2026-02-28");
    expect(firstOccurrenceOnOrAfter(monthly, "2026-02-28")).toBe("2026-02-28");
    expect(firstOccurrenceOnOrAfter(monthly, "2026-03-01")).toBe("2026-03-31");
    expect(firstOccurrenceOnOrAfter(schedule("weekly", "2026-01-05"), "2026-01-06")).toBe("2026-01-12");
    expect(firstOccurrenceOnOrAfter(schedule("daily", "2026-01-05", 4), "2026-01-06")).toBe("2026-01-09");
    expect(firstOccurrenceOnOrAfter(schedule("yearly", "2024-02-29"), "2025-03-01")).toBe("2026-02-28");
  });

  it("lists occurrences up to a date and the next one after it", () => {
    expect(occurrencesUntil(schedule("weekly", "2026-01-05"), "2026-01-05", "2026-01-27")).toEqual({
      dates: ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"],
      next: "2026-02-02",
    });
    expect(occurrencesUntil(schedule("daily", "2026-01-05"), "2026-01-06", "2026-01-05")).toEqual({
      dates: [],
      next: "2026-01-06",
    });
  });

  it("computes the stale cutoff as two years back", () => {
    expect(staleCutoff("2026-10-11")).toBe("2024-10-11");
    expect(staleCutoff("2028-02-29")).toBe("2026-02-28");
  });
});
