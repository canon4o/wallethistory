import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { getForecastData } from "@/lib/data/reports";
import {
  completeMonths,
  FORECAST_MONTHS,
  forecastRange,
  forecastLine,
  MAX_TREND_FACTOR,
  trendOf,
  yearEndCents,
} from "@/lib/reports/forecast";
import type { ReportFilters } from "@/lib/validation/reports";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe("trendOf", () => {
  it("compares the last third of the months with the first third", () => {
    // Months 5-6 (260) against months 1-2 (200): +30%.
    const trend = trendOf([100, 100, 100, 120, 130, 130]);
    expect(trend.direction).toBe("up");
    expect(trend.change).toBeCloseTo(0.3, 10);
    expect(trend.factor).toBeCloseTo(1.3, 10);
  });

  it("gives a falling category a factor below one", () => {
    const trend = trendOf([100, 100, 90, 80, 80, 70]);
    expect(trend.direction).toBe("down");
    expect(trend.change).toBeCloseTo(-0.25, 10);
    expect(trend.factor).toBeCloseTo(0.75, 10);
  });

  it("calls small changes stable and leaves the average alone", () => {
    const trend = trendOf([100, 100, 100, 100, 102, 100]);
    expect(trend).toEqual({ change: 0.01, direction: "stable", factor: 1 });
  });

  it("limits the factor so one unusual month cannot run away", () => {
    expect(trendOf([10, 10, 10, 10, 100, 100]).factor).toBe(1 + MAX_TREND_FACTOR);
    expect(trendOf([100, 100, 10, 10, 0, 0]).factor).toBe(1 - MAX_TREND_FACTOR);
  });

  it("handles a category that started or stopped, and one with no spending", () => {
    expect(trendOf([0, 0, 0, 0, 50, 50])).toEqual({ change: null, direction: "up", factor: 1 + MAX_TREND_FACTOR });
    expect(trendOf([0, 0, 0])).toEqual({ change: 0, direction: "stable", factor: 1 });
  });

  it("uses one month against one month when there are only two", () => {
    expect(trendOf([100, 150]).change).toBeCloseTo(0.5, 10);
  });
});

describe("forecastLine", () => {
  it("projects the monthly average times the trend factor, in whole cents", () => {
    const line = forecastLine({ key: "expense:Groceries", name: "Groceries", color: "#fff", icon: null, cents: [10000, 10000, 10000, 12000, 13000, 13000] });
    expect(line.averageCents).toBe(11333);
    expect(line.lastCents).toBe(13000);
    expect(line.forecastCents).toBe(14733);
  });
});

describe("completeMonths", () => {
  const range = { start: "2026-04-01", end: "2026-10-31" };

  it("leaves out the month in progress", () => {
    expect(completeMonths(range, "2026-10-15")).toEqual([
      "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01",
    ]);
  });

  it("leaves out months the period only partly covers", () => {
    expect(completeMonths({ start: "2026-04-10", end: "2026-07-20" }, "2026-10-15")).toEqual(["2026-05-01", "2026-06-01"]);
  });

  it("counts a month once its last day is over", () => {
    expect(completeMonths({ start: "2026-09-01", end: "2026-09-30" }, "2026-09-30")).toEqual([]);
    expect(completeMonths({ start: "2026-09-01", end: "2026-09-30" }, "2026-10-01")).toEqual(["2026-09-01"]);
  });
});

describe("yearEndCents", () => {
  it("adds the average for the months left, this month's remainder pro rata", () => {
    // Oct 15: 2 full months (Nov, Dec) + 16/31 of October.
    expect(yearEndCents(728000, 116000, "2026-10-15")).toBe(728000 + Math.round(116000 * (2 + 16 / 31)));
  });

  it("is the spending so far on the last day of the year", () => {
    expect(yearEndCents(500000, 116000, "2026-12-31")).toBe(500000);
  });
});

describe("forecastRange", () => {
  it("is the last 6 months ending with the current month", () => {
    expect(forecastRange("2026-10-15")).toEqual({ start: "2026-05-01", end: "2026-10-31" });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("getForecastData", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let empty: { id: string };
  let sparse: { id: string };
  const TODAY = "2026-10-15";
  const filters = (extra: Partial<ReportFilters> = {}): ReportFilters => ({
    range: { start: "2026-04-01", end: "2026-10-31" },
    ...extra,
  });

  async function add(userId: string, amount: string, date: string, category?: string, type: "income" | "expense" = "expense") {
    await getDb()
      .insert(transactions)
      .values({
        userId,
        type,
        amount,
        date,
        accountId: await defaultAccountId(userId),
        categoryId: category ? await categoryIdByName(userId, category) : null,
      });
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    empty = await users.create({ label: "empty" });
    sparse = await users.create({ label: "sparse" });
    const rent = ["1000.00", "1000.00", "1000.00", "1000.00", "1000.00", "1000.00"];
    const groceries = ["100.00", "100.00", "100.00", "120.00", "130.00", "130.00"];
    const transport = ["60.00", "60.00", "60.00", "40.00", "30.00", "30.00"];
    for (let index = 0; index < 6; index++) {
      const date = `2026-${String(index + 4).padStart(2, "0")}-05`;
      await add(alice.id, rent[index], date, "Rent");
      await add(alice.id, groceries[index], date, "Groceries");
      await add(alice.id, transport[index], date, "Transport");
    }
    await add(alice.id, "50.00", "2026-01-10");
    await add(alice.id, "70.00", "2026-03-10", "Groceries");
    await add(alice.id, "200.00", "2026-10-05", "Rent"); // the month in progress
    await add(alice.id, "999.00", "2026-10-20", "Rent"); // later than today
    await add(alice.id, "5000.00", "2026-08-01", "Salary", "income");
    await add(sparse.id, "100.00", "2026-09-05", "Rent");
  });

  afterAll(async () => {
    await users.cleanup();
  });

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(getForecastData(filters(), TODAY))).toBe("/login");
  });

  it("averages six complete months per category and projects the trend", async () => {
    await signInAs(alice.id);
    const data = await getForecastData(filters(), TODAY);
    expect(data).toMatchObject({ hasData: true, canForecast: true, historyMonths: 6, trend: "stable" });
    expect(data.categories.map((row) => row.name)).toEqual(["Rent", "Groceries", "Transport"]);
    expect(data.categories[0]).toMatchObject({ last: "1000.00", average: "1000.00", forecast: "1000.00", trend: "stable" });
    expect(data.categories[1]).toMatchObject({ last: "130.00", average: "113.33", forecast: "147.33", trend: "up" });
    expect(data.categories[2]).toMatchObject({ last: "30.00", average: "46.67", forecast: "23.34", trend: "down" });
    expect(data.average).toBe("1160.00");
    expect(data.monthly).toBe("1170.67");
    expect(data.horizon).toBe("3512.01");
  });

  it("returns six months of actuals and three months ahead, joined at the last actual month", async () => {
    await signInAs(alice.id);
    const data = await getForecastData(filters(), TODAY);
    expect(FORECAST_MONTHS).toBe(3);
    expect(data.months).toHaveLength(6 + 3);
    expect(data.months[0]).toEqual({ month: "2026-04-01", actual: "1160.00", forecast: null });
    expect(data.months[5]).toEqual({ month: "2026-09-01", actual: "1160.00", forecast: "1160.00" });
    expect(data.months[6]).toEqual({ month: "2026-10-01", actual: null, forecast: "1170.67" });
    expect(data.months[8].month).toBe("2026-12-01");
  });

  it("projects the year end from spending so far this year, leaving out later dates and income", async () => {
    await signInAs(alice.id);
    const data = await getForecastData(filters(), TODAY);
    expect(data.yearEnd).toEqual({
      year: "2026",
      spentSoFar: "7280.00",
      projected: (Math.round(728000 + 116000 * (2 + 16 / 31)) / 100).toFixed(2),
    });
  });

  it("narrows to one category", async () => {
    await signInAs(alice.id);
    const data = await getForecastData(filters({ category: "expense:Groceries" }), TODAY);
    expect(data.categories.map((row) => row.name)).toEqual(["Groceries"]);
    expect(data.yearEnd?.spentSoFar).toBe("750.00");
  });

  it("returns an empty result for a user without expenses", async () => {
    await signInAs(empty.id);
    const data = await getForecastData(filters(), TODAY);
    expect(data).toMatchObject({ hasData: false, canForecast: false, months: [], categories: [], yearEnd: null });
  });

  it("returns an empty result when the period has no complete month", async () => {
    await signInAs(alice.id);
    const data = await getForecastData({ range: { start: "2026-10-01", end: "2026-10-31" } }, TODAY);
    expect(data.hasData).toBe(false);
    expect(data.historyMonths).toBe(0);
  });

  it("starts at the first month with an expense and does not project from a single month", async () => {
    await signInAs(sparse.id);
    const data = await getForecastData(filters(), TODAY);
    expect(data).toMatchObject({
      hasData: true,
      canForecast: false,
      historyMonths: 1,
      yearEnd: null,
      months: [{ month: "2026-09-01", actual: "100.00", forecast: null }],
    });
  });
});
