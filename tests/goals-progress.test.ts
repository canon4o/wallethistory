import { describe, expect, it } from "vitest";
import { buildSavedSeries, goalProgress, recentMonthlyPaceCents } from "@/lib/goals/progress";

describe("goalProgress", () => {
  const base = { targetCents: 100_000, deadline: null, today: "2026-10-11" };

  it("computes the share saved and what is left", () => {
    expect(goalProgress({ ...base, savedCents: 25_000 })).toEqual({
      percent: 25,
      remainingCents: 75_000,
      completed: false,
      daysLeft: null,
      overdue: false,
      monthlyNeededCents: null,
    });
  });

  it("rounds the percentage down so an almost finished goal never reads as done", () => {
    expect(goalProgress({ ...base, savedCents: 99_999 }).percent).toBe(99);
    expect(goalProgress({ ...base, savedCents: 0 }).percent).toBe(0);
  });

  it("is completed at the target and caps at 100% above it", () => {
    expect(goalProgress({ ...base, savedCents: 100_000 })).toMatchObject({ percent: 100, remainingCents: 0, completed: true });
    expect(goalProgress({ ...base, savedCents: 130_000 })).toMatchObject({ percent: 100, remainingCents: 0, completed: true });
  });

  it("never goes below zero and handles an empty target", () => {
    expect(goalProgress({ ...base, savedCents: -500 }).percent).toBe(0);
    expect(goalProgress({ ...base, savedCents: 10, targetCents: 0 }).percent).toBe(0);
  });

  it("works out the monthly amount needed for the deadline, at least one month", () => {
    // 90 days is about 3 months: 75,000 / 3 = 25,000.
    expect(goalProgress({ ...base, savedCents: 25_000, deadline: "2027-01-09" })).toMatchObject({
      daysLeft: 90,
      overdue: false,
      monthlyNeededCents: 25_000,
    });
    // Due tomorrow: the whole remainder in one month.
    expect(goalProgress({ ...base, savedCents: 25_000, deadline: "2026-10-12" }).monthlyNeededCents).toBe(75_000);
    // Rounds up so the target is really reached.
    expect(goalProgress({ ...base, savedCents: 0, targetCents: 1_000, deadline: "2027-01-09" }).monthlyNeededCents).toBe(334);
  });

  it("flags an overdue goal, but not a completed one", () => {
    expect(goalProgress({ ...base, savedCents: 10, deadline: "2026-10-01" })).toMatchObject({
      daysLeft: -10,
      overdue: true,
      monthlyNeededCents: null,
    });
    expect(goalProgress({ ...base, savedCents: 100_000, deadline: "2026-10-01" })).toMatchObject({ overdue: false, monthlyNeededCents: null });
  });
});

describe("buildSavedSeries", () => {
  it("adds up movements per day into a running total, oldest first", () => {
    expect(
      buildSavedSeries([
        { date: "2026-10-02", deltaCents: 500 },
        { date: "2026-09-01", deltaCents: 1_000 },
        { date: "2026-09-01", deltaCents: 250 },
        { date: "2026-10-05", deltaCents: -300 },
      ]),
    ).toEqual([
      { date: "2026-09-01", savedCents: 1_250 },
      { date: "2026-10-02", savedCents: 1_750 },
      { date: "2026-10-05", savedCents: 1_450 },
    ]);
    expect(buildSavedSeries([])).toEqual([]);
  });
});

describe("recentMonthlyPaceCents", () => {
  const today = "2026-10-11";
  it("averages the net deposits of the last 90 days over 3 months", () => {
    expect(
      recentMonthlyPaceCents(
        [
          { date: "2026-10-01", deltaCents: 30_000 },
          { date: "2026-08-15", deltaCents: 60_000 },
          { date: "2026-09-01", deltaCents: -3_000 },
          { date: "2026-06-01", deltaCents: 999_999 },
          { date: "2026-10-12", deltaCents: 999_999 },
        ],
        today,
      ),
    ).toBe(29_000);
  });
  it("is zero without recent deposits and never negative", () => {
    expect(recentMonthlyPaceCents([], today)).toBe(0);
    expect(recentMonthlyPaceCents([{ date: "2026-10-01", deltaCents: -5_000 }], today)).toBe(0);
  });
});
