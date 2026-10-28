import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  budgetAlertDismissals,
  budgets,
  householdMembers,
  households,
  recurringRules,
  transactions,
  users as usersTable,
} from "@/db/schema";
import { listBudgetAlerts } from "@/lib/data/budget-alerts";
import { materializeDueRules } from "@/lib/recurring/materialize";
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
const WEEK_START = "2026-10-05";
const MONTH_START = "2026-10-01";

describe.skipIf(!TEST_DATABASE_URL)("listBudgetAlerts", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string }; // in alice's household
  let carol: { id: string }; // unrelated
  let groceries: string;
  let rent: string;
  let transport: string;
  let householdId: string;

  const mine = () => [alice.id, bob.id, carol.id];

  async function spend(userId: string, categoryId: string, amount: string, date: string) {
    await getDb()
      .insert(transactions)
      .values({ userId, accountId: await defaultAccountId(userId), categoryId, amount, date, type: "expense" });
  }
  async function budget(userId: string, categoryId: string, amount: string, period: "weekly" | "monthly") {
    const [row] = await getDb().insert(budgets).values({ userId, categoryId, amount, period }).returning({ id: budgets.id });
    return row.id;
  }
  const setAlertSettings = (userId: string, values: { budgetAlertsEnabled?: boolean; budgetAlertThreshold?: number }) =>
    getDb().update(usersTable).set(values).where(eq(usersTable.id, userId));

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    carol = await users.create({ label: "carol" });
    groceries = await categoryIdByName(alice.id, "Groceries");
    rent = await categoryIdByName(alice.id, "Rent");
    transport = await categoryIdByName(alice.id, "Transport");
    const [household] = await getDb().insert(households).values({}).returning({ id: households.id });
    householdId = household.id;
    await getDb().insert(householdMembers).values([
      { householdId, userId: alice.id },
      { householdId, userId: bob.id },
    ]);
  });
  afterEach(async () => {
    await getDb().delete(recurringRules).where(inArray(recurringRules.userId, mine()));
    await getDb().delete(transactions).where(inArray(transactions.userId, mine()));
    await getDb().delete(budgets).where(inArray(budgets.userId, mine())); // dismissals cascade
    await setAlertSettings(alice.id, { budgetAlertsEnabled: true, budgetAlertThreshold: 80 });
  });
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(listBudgetAlerts(TODAY))).toBe("/login");
  });

  it("is empty without budgets or when nothing is close to a limit", async () => {
    await signInAs(alice.id);
    expect(await listBudgetAlerts(TODAY)).toEqual([]);
    await budget(alice.id, groceries, "100.00", "monthly");
    await spend(alice.id, groceries, "79.99", "2026-10-02");
    expect(await listBudgetAlerts(TODAY)).toEqual([]);
  });

  it("warns from the threshold up to the limit, and says exceeded above it", async () => {
    await signInAs(alice.id);
    const id = await budget(alice.id, groceries, "100.00", "monthly");
    await spend(alice.id, groceries, "85.00", "2026-10-02");
    expect(await listBudgetAlerts(TODAY)).toEqual([
      {
        budgetId: id,
        level: "warning",
        period: "monthly",
        category: expect.objectContaining({ name: "Groceries" }),
        spent: "85.00",
        amount: "100.00",
        percent: 85,
        periodStart: MONTH_START,
      },
    ]);
    await spend(alice.id, groceries, "15.00", "2026-10-03"); // exactly 100: still a warning
    expect(await listBudgetAlerts(TODAY)).toMatchObject([{ level: "warning", percent: 100 }]);
    await spend(alice.id, groceries, "0.01", "2026-10-04");
    expect(await listBudgetAlerts(TODAY)).toMatchObject([{ level: "exceeded", spent: "100.01", percent: 100 }]);
  });

  it("uses the user's threshold", async () => {
    await signInAs(alice.id);
    await budget(alice.id, groceries, "100.00", "monthly");
    await spend(alice.id, groceries, "60.00", "2026-10-02");
    expect(await listBudgetAlerts(TODAY)).toEqual([]);
    await setAlertSettings(alice.id, { budgetAlertThreshold: 60 });
    await signInAs(alice.id);
    expect(await listBudgetAlerts(TODAY)).toMatchObject([{ level: "warning", percent: 60 }]);
  });

  it("returns nothing when alerts are disabled, even over a limit", async () => {
    await budget(alice.id, groceries, "100.00", "monthly");
    await spend(alice.id, groceries, "150.00", "2026-10-02");
    await setAlertSettings(alice.id, { budgetAlertsEnabled: false });
    await signInAs(alice.id);
    expect(await listBudgetAlerts(TODAY)).toEqual([]);
  });

  it("counts weekly budgets over the current week and monthly ones over the month", async () => {
    await signInAs(alice.id);
    await budget(alice.id, groceries, "100.00", "weekly");
    await budget(alice.id, rent, "100.00", "monthly");
    // Groceries: only 30 this week (Mon 5th and Sun 11th), the rest is this month or last week.
    await spend(alice.id, groceries, "15.00", "2026-10-05");
    await spend(alice.id, groceries, "15.00", "2026-10-11");
    await spend(alice.id, groceries, "200.00", "2026-10-04");
    await spend(alice.id, groceries, "200.00", "2026-10-12");
    // Rent: 90 this month across weeks, 500 last month.
    await spend(alice.id, rent, "50.00", "2026-10-01");
    await spend(alice.id, rent, "40.00", "2026-10-30");
    await spend(alice.id, rent, "500.00", "2026-09-30");
    const alerts = await listBudgetAlerts(TODAY);
    expect(alerts.map((a) => [a.category.name, a.period, a.level, a.periodStart])).toEqual([["Rent", "monthly", "warning", MONTH_START]]);

    await spend(alice.id, groceries, "60.00", "2026-10-06");
    expect((await listBudgetAlerts(TODAY)).map((a) => [a.category.name, a.period, a.periodStart])).toEqual([
      ["Groceries", "weekly", WEEK_START],
      ["Rent", "monthly", MONTH_START],
    ]);
  });

  it("sorts exceeded first, then by percent", async () => {
    await signInAs(alice.id);
    await budget(alice.id, groceries, "100.00", "monthly");
    await budget(alice.id, rent, "100.00", "monthly");
    await budget(alice.id, transport, "100.00", "monthly");
    await spend(alice.id, groceries, "95.00", "2026-10-02"); // warning 95
    await spend(alice.id, rent, "120.00", "2026-10-02"); // exceeded 120
    await spend(alice.id, transport, "180.00", "2026-10-02"); // exceeded 180
    expect((await listBudgetAlerts(TODAY)).map((a) => [a.category.name, a.level, a.percent])).toEqual([
      ["Transport", "exceeded", 180],
      ["Rent", "exceeded", 120],
      ["Groceries", "warning", 95],
    ]);
  });

  it("breaks ties by category name, then period", async () => {
    await signInAs(alice.id);
    await budget(alice.id, rent, "100.00", "monthly");
    await budget(alice.id, groceries, "100.00", "monthly");
    await budget(alice.id, groceries, "100.00", "weekly");
    await spend(alice.id, rent, "90.00", "2026-10-06");
    await spend(alice.id, groceries, "90.00", "2026-10-06");
    expect((await listBudgetAlerts(TODAY)).map((a) => [a.category.name, a.period])).toEqual([
      ["Groceries", "monthly"],
      ["Groceries", "weekly"],
      ["Rent", "monthly"],
    ]);
  });

  it("never shows household members' budgets or anyone else's data", async () => {
    await budget(bob.id, await categoryIdByName(bob.id, "Groceries"), "10.00", "monthly");
    await spend(bob.id, await categoryIdByName(bob.id, "Groceries"), "50.00", "2026-10-02");
    await budget(carol.id, await categoryIdByName(carol.id, "Groceries"), "10.00", "monthly");
    await spend(carol.id, await categoryIdByName(carol.id, "Groceries"), "50.00", "2026-10-02");
    await signInAs(alice.id);
    expect(await listBudgetAlerts(TODAY)).toEqual([]);
    await signInAs(bob.id);
    expect(await listBudgetAlerts(TODAY)).toMatchObject([{ level: "exceeded" }]);
    await signInAs(carol.id);
    expect(await listBudgetAlerts(TODAY)).toHaveLength(1);
  });

  it("is triggered by an expense a recurring rule created, and goes away when it is deleted", async () => {
    await signInAs(alice.id);
    await budget(alice.id, groceries, "100.00", "monthly");
    const [rule] = await getDb()
      .insert(recurringRules)
      .values({
        userId: alice.id,
        kind: "expense",
        amount: "90.00",
        accountId: await defaultAccountId(alice.id),
        categoryId: groceries,
        frequency: "monthly",
        intervalCount: 1,
        startDate: "2026-10-02",
        nextDueDate: "2026-10-02",
      })
      .returning();
    expect(await listBudgetAlerts(TODAY)).toEqual([]);
    expect(await materializeDueRules([alice.id], { today: TODAY })).toEqual({ created: 1 });
    expect(await listBudgetAlerts(TODAY)).toMatchObject([{ level: "warning", spent: "90.00" }]);
    await getDb().delete(transactions).where(eq(transactions.recurringRuleId, rule.id));
    expect(await listBudgetAlerts(TODAY)).toEqual([]);
  });

  describe("dismissals", () => {
    async function dismiss(budgetId: string, periodStart: string, level: "warning" | "exceeded", userId = alice.id) {
      await getDb().insert(budgetAlertDismissals).values({ userId, budgetId, periodStart, level });
    }

    it("hides the dismissed level for that period at once (not cached)", async () => {
      await signInAs(alice.id);
      const id = await budget(alice.id, groceries, "100.00", "monthly");
      await spend(alice.id, groceries, "85.00", "2026-10-02");
      expect(await listBudgetAlerts(TODAY)).toHaveLength(1);
      await dismiss(id, MONTH_START, "warning");
      expect(await listBudgetAlerts(TODAY)).toEqual([]);
    });

    it("dismissing the warning does not hide a later exceeded in the same period", async () => {
      await signInAs(alice.id);
      const id = await budget(alice.id, groceries, "100.00", "monthly");
      await spend(alice.id, groceries, "85.00", "2026-10-02");
      await dismiss(id, MONTH_START, "warning");
      await spend(alice.id, groceries, "20.00", "2026-10-03");
      expect(await listBudgetAlerts(TODAY)).toMatchObject([{ budgetId: id, level: "exceeded" }]);
      await dismiss(id, MONTH_START, "exceeded");
      expect(await listBudgetAlerts(TODAY)).toEqual([]);
    });

    it("applies to its own budget only", async () => {
      await signInAs(alice.id);
      const weekly = await budget(alice.id, groceries, "100.00", "weekly");
      await budget(alice.id, groceries, "100.00", "monthly");
      await spend(alice.id, groceries, "90.00", "2026-10-06");
      await dismiss(weekly, WEEK_START, "warning");
      expect((await listBudgetAlerts(TODAY)).map((a) => a.period)).toEqual(["monthly"]);
    });

    it("stops applying in a new period, so the alert shows again", async () => {
      await signInAs(alice.id);
      const id = await budget(alice.id, groceries, "100.00", "monthly");
      await spend(alice.id, groceries, "85.00", "2026-10-02");
      await spend(alice.id, groceries, "85.00", "2026-11-02");
      await dismiss(id, MONTH_START, "warning");
      expect(await listBudgetAlerts(TODAY)).toEqual([]);
      expect(await listBudgetAlerts("2026-11-10")).toMatchObject([{ level: "warning", periodStart: "2026-11-01" }]);
    });
  });
});
