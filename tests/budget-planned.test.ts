import { describe, expect, it } from "vitest";
import { plannedCents, type PlannedRule } from "@/lib/budget-planned";

const october = { start: "2026-10-01", end: "2026-10-31" };
const TODAY = "2026-10-08";
const week = { start: "2026-10-05", end: "2026-10-11" };

const rule = (overrides: Partial<PlannedRule> = {}): PlannedRule => ({
  amountCents: 1_000,
  frequency: "monthly",
  intervalCount: 1,
  startDate: "2026-01-20",
  endDate: null,
  nextDueDate: "2026-10-20",
  ...overrides,
});

describe("plannedCents", () => {
  it("counts every remaining occurrence in the period", () => {
    expect(plannedCents([rule()], october, TODAY)).toBe(1_000);
    expect(plannedCents([rule({ frequency: "weekly", startDate: "2026-10-06", nextDueDate: "2026-10-13" })], october, TODAY)).toBe(3_000);
    expect(plannedCents([rule({ frequency: "daily", startDate: "2026-10-08", nextDueDate: "2026-10-08" })], week, TODAY)).toBe(3_000);
  });

  it("adds up several rules", () => {
    expect(plannedCents([rule(), rule({ amountCents: 250 })], october, TODAY)).toBe(1_250);
  });

  it("ignores occurrences outside the period", () => {
    expect(plannedCents([rule()], week, TODAY)).toBe(0);
    expect(plannedCents([rule({ nextDueDate: "2026-11-20" })], october, TODAY)).toBe(0);
  });

  it("counts only occurrences after today, not the ones already created or due", () => {
    const daily = { frequency: "daily", startDate: "2026-10-05", nextDueDate: "2026-10-05" } as const;
    expect(plannedCents([rule(daily)], week, TODAY)).toBe(3_000); // Oct 9, 10 and 11
    expect(plannedCents([rule(daily)], week, "2026-10-11")).toBe(0);
    expect(plannedCents([rule({ nextDueDate: "2026-10-08", startDate: "2026-10-08" })], week, TODAY)).toBe(0);
    expect(plannedCents([rule({ nextDueDate: "2026-10-09", startDate: "2026-10-09" })], week, TODAY)).toBe(1_000);
  });

  it("counts the whole next period when it has not started", () => {
    expect(plannedCents([rule({ nextDueDate: "2026-11-20" })], { start: "2026-11-01", end: "2026-11-30" }, TODAY)).toBe(1_000);
  });

  it("stops at the end date of the rule", () => {
    const weekly = { frequency: "weekly", startDate: "2026-10-06", nextDueDate: "2026-10-13" } as const;
    expect(plannedCents([rule({ ...weekly, endDate: "2026-10-20" })], october, TODAY)).toBe(2_000);
    expect(plannedCents([rule({ ...weekly, endDate: "2026-10-12" })], october, TODAY)).toBe(0);
  });

  it("is zero without rules", () => {
    expect(plannedCents([], october, TODAY)).toBe(0);
  });
});
