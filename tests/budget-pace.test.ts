import { describe, expect, it } from "vitest";
import { elapsedPercent, periodDays, projectedCents } from "@/lib/budget-pace";

const october = { start: "2026-10-01", end: "2026-10-31" };
const week = { start: "2026-10-05", end: "2026-10-11" };

describe("budget pace", () => {
  it("counts the days that have passed, today included", () => {
    expect(periodDays(october, "2026-10-01")).toEqual({ elapsed: 1, total: 31 });
    expect(periodDays(october, "2026-10-31")).toEqual({ elapsed: 31, total: 31 });
    expect(periodDays(week, "2026-10-08")).toEqual({ elapsed: 4, total: 7 });
  });

  it("clamps days before the period starts and after it ends", () => {
    expect(periodDays(october, "2026-09-20").elapsed).toBe(0);
    expect(periodDays(october, "2026-11-20").elapsed).toBe(31);
  });

  it("gives the share of the period that has passed, rounded down", () => {
    expect(elapsedPercent(week, "2026-10-08")).toBe(57);
    expect(elapsedPercent(october, "2026-10-31")).toBe(100);
    expect(elapsedPercent(october, "2026-09-20")).toBe(0);
  });

  it("projects the spending at the current daily rate", () => {
    expect(projectedCents(10_000, october, "2026-10-10")).toBe(31_000);
    expect(projectedCents(10_000, week, "2026-10-08")).toBe(17_500);
    expect(projectedCents(333, october, "2026-10-31")).toBe(333);
  });

  it("does not project before the period or without spending", () => {
    expect(projectedCents(10_000, october, "2026-09-20")).toBeNull();
    expect(projectedCents(0, october, "2026-10-10")).toBeNull();
  });
});
