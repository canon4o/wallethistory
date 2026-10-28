import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { budgets, recurringRules, transactions } from "@/db/schema";
import { getBudgetHints, listBudgets } from "@/lib/data/budgets";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

// Thursday 2026-10-08. Its week is Mon 2026-10-05 .. Sun 2026-10-11; its month is October 2026.
const TODAY = "2026-10-08";

describe.skipIf(!TEST_DATABASE_URL)("listBudgets", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let cash: string;
  let groceries: string;
  let rent: string;
  let transport: string;
  let salary: string;

  async function spend(userId: string, categoryId: string | null, amount: string, date: string, type: "expense" | "income" = "expense") {
    await getDb().insert(transactions).values({ userId, accountId: await defaultAccountId(userId), categoryId, amount, date, type });
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    cash = await defaultAccountId(alice.id);
    expect(cash).toBeTruthy();
    groceries = await categoryIdByName(alice.id, "Groceries");
    rent = await categoryIdByName(alice.id, "Rent");
    transport = await categoryIdByName(alice.id, "Transport");
    salary = await categoryIdByName(alice.id, "Salary");
  });
  afterAll(users.cleanup);

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(listBudgets(TODAY))).toBe("/login");
    expect(await redirectTarget(getBudgetHints(TODAY))).toBe("/login");
  });

  it("is empty without budgets", async () => {
    await signInAs(alice.id);
    expect(await listBudgets(TODAY)).toEqual([]);
  });

  describe("spending windows", () => {
    beforeAll(async () => {
      await getDb().insert(budgets).values([
        { userId: alice.id, categoryId: groceries, amount: "100.00", period: "weekly" },
        { userId: alice.id, categoryId: groceries, amount: "400.00", period: "monthly" },
        { userId: alice.id, categoryId: rent, amount: "1000.00", period: "monthly" },
        { userId: alice.id, categoryId: transport, amount: "50.00", period: "weekly" },
      ]);
      // Groceries, inside this week and month
      await spend(alice.id, groceries, "30.00", "2026-10-05"); // Monday: first day of the week
      await spend(alice.id, groceries, "20.50", "2026-10-11"); // Sunday: last day of the week
      // Groceries, this month but outside this week
      await spend(alice.id, groceries, "60.00", "2026-10-04"); // Sunday before
      await spend(alice.id, groceries, "15.00", "2026-10-12"); // Monday after
      await spend(alice.id, groceries, "5.00", "2026-10-01");
      // Groceries, outside this month
      await spend(alice.id, groceries, "999.00", "2026-09-30");
      await spend(alice.id, groceries, "999.00", "2026-11-01");
      // Not expenses of that category
      await spend(alice.id, salary, "500.00", "2026-10-06", "income"); // income category
      await spend(alice.id, null, "77.00", "2026-10-06"); // uncategorized
      await spend(alice.id, rent, "1200.00", "2026-10-02"); // over the monthly rent budget
      // Other user's spending in an identically named category
      await spend(bob.id, await categoryIdByName(bob.id, "Groceries"), "888.00", "2026-10-06");
    });

    it("sums only this period's expenses of the budget's category", async () => {
      await signInAs(alice.id);
      const list = await listBudgets(TODAY);
      const find = (name: string, period: string) => list.find((b) => b.category.name === name && b.period === period)!;

      expect(find("Groceries", "weekly")).toMatchObject({ amount: "100.00", spent: "50.50", remaining: "49.50" });
      expect(find("Groceries", "monthly")).toMatchObject({ amount: "400.00", spent: "130.50", remaining: "269.50" });
      expect(find("Transport", "weekly")).toMatchObject({ spent: "0.00", remaining: "50.00" });
    });

    it("adds the last six complete periods, oldest first, with zero for periods without spending", async () => {
      await signInAs(alice.id);
      const list = await listBudgets(TODAY);
      const find = (name: string, period: string) => list.find((b) => b.category.name === name && b.period === period)!;

      const weekly = find("Groceries", "weekly").history;
      expect(weekly.map((entry) => entry.range.start)).toEqual([
        "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
      ]);
      expect(weekly[5].spent).toBe("1064.00"); // Sep 30 (999), Oct 1 (5) and Oct 4 (60)
      expect(weekly[0].spent).toBe("0.00");
      const monthly = find("Groceries", "monthly").history;
      expect(monthly.map((entry) => entry.range.start)).toEqual([
        "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01",
      ]);
      expect(monthly[5].spent).toBe("999.00");
    });

    it("adds the recurring expenses still to come, only from active expense rules of the budget's category", async () => {
      await signInAs(alice.id);
      const rule = {
        userId: alice.id,
        accountId: cash,
        amount: "20.00",
        frequency: "weekly" as const,
        intervalCount: 1,
        startDate: "2026-10-10",
        nextDueDate: "2026-10-10",
      };
      await getDb()
        .insert(recurringRules)
        .values([
          { ...rule, kind: "expense", categoryId: groceries },
          { ...rule, kind: "expense", categoryId: groceries, amount: "5.00", status: "paused", pausedReason: "manual" },
          { ...rule, kind: "expense", categoryId: transport, amount: "7.00" },
          { ...rule, kind: "income", categoryId: salary, amount: "9.00" },
        ]);
      const list = await listBudgets(TODAY);
      const find = (name: string, period: string) => list.find((b) => b.category.name === name && b.period === period)!;

      // Oct 10 and 17, 24 and 31 fall in October; only Oct 10 falls in the week.
      expect(find("Groceries", "monthly").planned).toBe("80.00");
      expect(find("Groceries", "weekly").planned).toBe("20.00");
      expect(find("Transport", "weekly").planned).toBe("7.00");
      expect(find("Rent", "monthly").planned).toBe("0.00");
      await getDb().delete(recurringRules).where(eq(recurringRules.userId, alice.id));
    });

    it("adds how much of the period has passed and the spending projected at that pace", async () => {
      await signInAs(alice.id);
      const list = await listBudgets(TODAY);
      const find = (name: string, period: string) => list.find((b) => b.category.name === name && b.period === period)!;

      // 2026-10-08 is the 4th day of the Monday-Sunday week and the 8th of 31 days in the month.
      expect(find("Groceries", "weekly")).toMatchObject({ elapsedPercent: 57, projected: "88.38" });
      expect(find("Groceries", "monthly")).toMatchObject({ elapsedPercent: 25, projected: "505.69" });
      expect(find("Transport", "weekly")).toMatchObject({ projected: null });
    });

    it("reports a negative remaining amount when over budget", async () => {
      await signInAs(alice.id);
      const rentBudget = (await listBudgets(TODAY)).find((b) => b.category.name === "Rent")!;
      expect(rentBudget).toMatchObject({ spent: "1200.00", remaining: "-200.00" });
    });

    it("includes the period window and the category's icon and color", async () => {
      await signInAs(alice.id);
      const list = await listBudgets(TODAY);
      const weekly = list.find((b) => b.period === "weekly")!;
      const monthly = list.find((b) => b.period === "monthly")!;
      expect(weekly.range).toEqual({ start: "2026-10-05", end: "2026-10-11" });
      expect(monthly.range).toEqual({ start: "2026-10-01", end: "2026-10-31" });
      expect(list.find((b) => b.category.name === "Groceries")!.category).toMatchObject({ icon: "shopping-cart", color: "#9cca56" });
    });

    it("moves the windows when today changes", async () => {
      await signInAs(alice.id);
      // Sunday 2026-10-04: the current week is Mon 2026-09-28 .. Sun 2026-10-04, so it holds
      // 999 (Sep 30) + 5 (Oct 1) + 60 (Oct 4).
      const lastWeek = await listBudgets("2026-10-04");
      expect(lastWeek.find((b) => b.category.name === "Groceries" && b.period === "weekly")).toMatchObject({ spent: "1064.00" });
      const september = await listBudgets("2026-09-15");
      expect(september.find((b) => b.category.name === "Groceries" && b.period === "monthly")).toMatchObject({ spent: "999.00" });
    });

    it("lists over-budget first, then by how much of the limit is used", async () => {
      await signInAs(alice.id);
      const order = (await listBudgets(TODAY)).map((b) => `${b.category.name}/${b.period}`);
      // Rent 120%, Groceries weekly 50.5%, Groceries monthly 32.6%, Transport 0%
      expect(order).toEqual(["Rent/monthly", "Groceries/weekly", "Groceries/monthly", "Transport/weekly"]);
    });

    it("never includes another user's budgets or spending", async () => {
      await signInAs(bob.id);
      expect(await listBudgets(TODAY)).toEqual([]);
      await getDb().insert(budgets).values({ userId: bob.id, categoryId: await categoryIdByName(bob.id, "Groceries"), amount: "500.00", period: "monthly" });
      const mine = await listBudgets(TODAY);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ spent: "888.00" });
      // Alice's numbers are untouched by Bob's spending.
      await signInAs(alice.id);
      expect((await listBudgets(TODAY)).find((b) => b.category.name === "Groceries" && b.period === "monthly")!.spent).toBe("130.50");
    });
  });

  describe("last period and forecast", () => {
    let dana: { id: string };
    let erin: { id: string };

    beforeAll(async () => {
      dana = await users.create({ label: "dana" });
      erin = await users.create({ label: "erin" });
      const danaGroceries = await categoryIdByName(dana.id, "Groceries");
      const danaTransport = await categoryIdByName(dana.id, "Transport");
      await getDb().insert(budgets).values([
        { userId: dana.id, categoryId: danaGroceries, amount: "200.00", period: "monthly" },
        { userId: dana.id, categoryId: danaGroceries, amount: "100.00", period: "weekly" },
        { userId: dana.id, categoryId: danaTransport, amount: "50.00", period: "monthly" },
      ]);
      // May to September: 100, 100, 100, 120, 130 (average 110, recent months +30%).
      for (const [month, amount] of [["05", "100.00"], ["06", "100.00"], ["07", "100.00"], ["08", "120.00"], ["09", "130.00"]]) {
        await spend(dana.id, danaGroceries, amount, `2026-${month}-10`);
      }
      // Last week (Mon 2026-09-28 .. Sun 2026-10-04), which is partly in September and partly in October.
      await spend(dana.id, danaGroceries, "7.00", "2026-10-01");
      await spend(dana.id, danaGroceries, "3.00", "2026-10-04");
      // One month of history is not enough to forecast.
      await spend(erin.id, await categoryIdByName(erin.id, "Groceries"), "80.00", "2026-09-10");
      await getDb().insert(budgets).values({ userId: erin.id, categoryId: await categoryIdByName(erin.id, "Groceries"), amount: "100.00", period: "monthly" });
    });

    it("shows the previous week or month's spending", async () => {
      await signInAs(dana.id);
      const list = await listBudgets(TODAY);
      const find = (name: string, period: string) => list.find((b) => b.category.name === name && b.period === period)!;
      expect(find("Groceries", "monthly").lastSpent).toBe("130.00");
      expect(find("Groceries", "weekly").lastSpent).toBe("10.00");
      expect(find("Transport", "monthly").lastSpent).toBe("0.00");
    });

    it("projects a month, or 12/52 of it for a weekly budget, from the last 6 months", async () => {
      await signInAs(dana.id);
      const list = await listBudgets(TODAY);
      const find = (name: string, period: string) => list.find((b) => b.category.name === name && b.period === period)!;
      expect(find("Groceries", "monthly").forecast).toBe("143.00");
      expect(find("Groceries", "weekly").forecast).toBe("33.00");
      expect(find("Transport", "monthly").forecast).toBe("0.00");
    });

    it("gives every expense category the previous period's spending, a forecast and its trend", async () => {
      await signInAs(dana.id);
      const hints = await getBudgetHints(TODAY);
      const groceries = hints[await categoryIdByName(dana.id, "Groceries")];
      expect(groceries.monthly).toEqual({ lastSpent: "130.00", forecast: "143.00", trend: "up" });
      expect(groceries.weekly).toEqual({ lastSpent: "10.00", forecast: "33.00", trend: "up" });
      // A category without a budget or spending is still listed and projected at zero.
      expect(hints[await categoryIdByName(dana.id, "Transport")].monthly).toEqual({ lastSpent: "0.00", forecast: "0.00", trend: "stable" });
      expect(hints[await categoryIdByName(dana.id, "Salary")]).toBeUndefined();
    });

    it("has no forecast or trend with a single month of history", async () => {
      await signInAs(erin.id);
      const hints = await getBudgetHints(TODAY);
      expect(hints[await categoryIdByName(erin.id, "Groceries")].monthly).toEqual({ lastSpent: "80.00", forecast: null, trend: null });
    });

    it("has no forecast with a single month of history", async () => {
      await signInAs(erin.id);
      const [only] = await listBudgets(TODAY);
      expect(only.lastSpent).toBe("80.00");
      expect(only.forecast).toBeNull();
    });
  });
});
