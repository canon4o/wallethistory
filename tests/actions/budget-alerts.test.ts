import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetAlertDismissals, budgets } from "@/db/schema";
import { dismissBudgetAlert, updateBudgetAlertSettings } from "@/lib/actions/budget-alerts";
import { periodRange, todayISO } from "@/lib/budget-period";
import { categoryIdByName } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { getUserRow, useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("budget alert actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let monthly: string;
  let weekly: string;
  let bobBudget: string;
  const now = new Date();
  const monthStart = periodRange("monthly", todayISO("UTC", now)).start;
  const weekStart = periodRange("weekly", todayISO("UTC", now)).start;

  const dismissalsOf = (budgetId: string) =>
    getDb().select().from(budgetAlertDismissals).where(eq(budgetAlertDismissals.budgetId, budgetId));

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    const [m, w] = await getDb()
      .insert(budgets)
      .values([
        { userId: alice.id, categoryId: await categoryIdByName(alice.id, "Groceries"), amount: "100.00", period: "monthly" },
        { userId: alice.id, categoryId: await categoryIdByName(alice.id, "Groceries"), amount: "100.00", period: "weekly" },
      ])
      .returning({ id: budgets.id });
    monthly = m.id;
    weekly = w.id;
    [{ id: bobBudget }] = await getDb()
      .insert(budgets)
      .values({ userId: bob.id, categoryId: await categoryIdByName(bob.id, "Groceries"), amount: "100.00", period: "monthly" })
      .returning({ id: budgets.id });
  });
  beforeEach(async () => {
    await signInAs(alice.id);
    vi.mocked(revalidatePath).mockClear();
    // Scoped to this file's users: other test files run in parallel against the same database.
    await getDb().delete(budgetAlertDismissals).where(inArray(budgetAlertDismissals.userId, [alice.id, bob.id]));
  });
  afterAll(users.cleanup);

  describe("dismissBudgetAlert", () => {
    const input = (extra: object = {}) => ({ budgetId: monthly, level: "warning", periodStart: monthStart, ...extra });

    it("requires a signed-in user", async () => {
      signOut();
      expect(await redirectTarget(dismissBudgetAlert(input()))).toBe("/login");
      expect(await redirectTarget(updateBudgetAlertSettings({ enabled: true, threshold: 80 }))).toBe("/login");
    });

    it("stores the dismissal for the current user and refreshes every page", async () => {
      expect(await dismissBudgetAlert(input())).toEqual({ ok: true });
      expect(await dismissalsOf(monthly)).toMatchObject([{ userId: alice.id, level: "warning", periodStart: monthStart }]);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/", "layout");
    });

    it("accepts the current week for a weekly budget", async () => {
      expect(await dismissBudgetAlert(input({ budgetId: weekly, periodStart: weekStart }))).toEqual({ ok: true });
      expect(await dismissalsOf(weekly)).toHaveLength(1);
    });

    it("is idempotent, and keeps each level apart", async () => {
      expect(await dismissBudgetAlert(input())).toEqual({ ok: true });
      expect(await dismissBudgetAlert(input())).toEqual({ ok: true });
      expect(await dismissalsOf(monthly)).toHaveLength(1);
      expect(await dismissBudgetAlert(input({ level: "exceeded" }))).toEqual({ ok: true });
      expect(await dismissalsOf(monthly)).toHaveLength(2);
    });

    it("answers 'not found' for another user's budget or an unknown one, and writes nothing", async () => {
      const notFound = { ok: false, error: "This item no longer exists." };
      expect(await dismissBudgetAlert(input({ budgetId: bobBudget }))).toEqual(notFound);
      expect(await dismissBudgetAlert(input({ budgetId: missing }))).toEqual(notFound);
      expect(await dismissalsOf(bobBudget)).toEqual([]);
    });

    it("rejects a period start that is not the budget's current period", async () => {
      const stale = { ok: false, error: "This alert is out of date." };
      expect(await dismissBudgetAlert(input({ periodStart: "2020-01-01" }))).toEqual(stale);
      // The week start is not the month start (unless the 1st is a Monday): use the previous month.
      const lastMonth = periodRange("monthly", new Date(Date.parse(`${monthStart}T00:00:00Z`) - 86400000).toISOString().slice(0, 10));
      expect(await dismissBudgetAlert(input({ periodStart: lastMonth.start }))).toEqual(stale);
      expect(await dismissBudgetAlert(input({ budgetId: weekly, periodStart: monthStart === weekStart ? "2020-01-06" : monthStart }))).toEqual(stale);
      expect(await dismissalsOf(monthly)).toEqual([]);
      expect(await dismissalsOf(weekly)).toEqual([]);
    });

    it("validates the input", async () => {
      expect(await dismissBudgetAlert({ budgetId: "nope", level: "info", periodStart: "2026-02-30" })).toMatchObject({
        ok: false,
        fieldErrors: { budgetId: expect.any(Array), level: expect.any(Array), periodStart: expect.any(Array) },
      });
      expect(await dismissBudgetAlert(null)).toMatchObject({ ok: false });
    });
  });

  describe("updateBudgetAlertSettings", () => {
    it("saves the switch and the threshold for the current user only", async () => {
      expect(await updateBudgetAlertSettings({ enabled: false, threshold: 65 })).toEqual({ ok: true });
      expect(await getUserRow(alice.id)).toMatchObject({ budgetAlertsEnabled: false, budgetAlertThreshold: 65 });
      expect(await getUserRow(bob.id)).toMatchObject({ budgetAlertsEnabled: true, budgetAlertThreshold: 80 });
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/", "layout");
      expect(await updateBudgetAlertSettings({ enabled: true, threshold: 80 })).toEqual({ ok: true });
    });

    it("accepts the bounds 50 and 99", async () => {
      expect(await updateBudgetAlertSettings({ enabled: true, threshold: 50 })).toEqual({ ok: true });
      expect(await updateBudgetAlertSettings({ enabled: true, threshold: 99 })).toEqual({ ok: true });
      expect((await getUserRow(alice.id)).budgetAlertThreshold).toBe(99);
      await updateBudgetAlertSettings({ enabled: true, threshold: 80 });
    });

    it.each([49, 100, 80.5, "80", null, Number.NaN])("rejects threshold %s", async (threshold) => {
      expect(await updateBudgetAlertSettings({ enabled: true, threshold })).toMatchObject({
        ok: false,
        error: "Please fix the highlighted fields.",
        fieldErrors: { threshold: ["Choose a warning level between 50% and 99%"] },
      });
      expect((await getUserRow(alice.id)).budgetAlertThreshold).toBe(80);
    });

    it("rejects a missing or non-boolean switch", async () => {
      expect(await updateBudgetAlertSettings({ threshold: 80 })).toMatchObject({ ok: false, fieldErrors: { enabled: expect.any(Array) } });
      expect(await updateBudgetAlertSettings({ enabled: "yes", threshold: 80 })).toMatchObject({ ok: false });
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("dismissals are cleared when the budget or its spending changes", () => {
  const users = useTestUsers();
  let ann: { id: string };
  let groceries: string;
  let rent: string;
  let groceriesBudget: string;
  let rentBudget: string;
  const start = periodRange("monthly", todayISO("UTC")).start;
  const left = async () =>
    (await getDb().select().from(budgetAlertDismissals).where(eq(budgetAlertDismissals.userId, ann.id))).map((row) => row.budgetId).sort();
  const dismissBoth = () =>
    getDb().insert(budgetAlertDismissals).values([
      { userId: ann.id, budgetId: groceriesBudget, periodStart: start, level: "warning" },
      { userId: ann.id, budgetId: rentBudget, periodStart: start, level: "warning" },
    ]);
  async function expense(categoryId: string, date = todayISO("UTC")) {
    const { transactions } = await import("@/db/schema");
    const { defaultAccountId } = await import("../helpers/data");
    const [row] = await getDb()
      .insert(transactions)
      .values({ userId: ann.id, accountId: await defaultAccountId(ann.id), categoryId, amount: "10.00", date, type: "expense" })
      .returning({ id: transactions.id });
    return row.id;
  }
  let accountId: string;
  const form = (categoryId: string) => ({ type: "expense", amount: "12", date: todayISO("UTC"), categoryId, accountId, tagIds: [], note: null });

  beforeAll(async () => {
    ann = await users.create({ label: "ann" });
    accountId = await (await import("../helpers/data")).defaultAccountId(ann.id);
    groceries = await categoryIdByName(ann.id, "Groceries");
    rent = await categoryIdByName(ann.id, "Rent");
    const rows = await getDb()
      .insert(budgets)
      .values([
        { userId: ann.id, categoryId: groceries, amount: "100.00", period: "monthly" },
        { userId: ann.id, categoryId: rent, amount: "100.00", period: "monthly" },
      ])
      .returning({ id: budgets.id, categoryId: budgets.categoryId });
    groceriesBudget = rows.find((row) => row.categoryId === groceries)!.id;
    rentBudget = rows.find((row) => row.categoryId === rent)!.id;
  });
  beforeEach(async () => {
    await signInAs(ann.id);
    await getDb().delete(budgetAlertDismissals).where(eq(budgetAlertDismissals.userId, ann.id));
    await dismissBoth();
  });
  afterAll(users.cleanup);

  it("editing a budget clears only its own dismissals", async () => {
    const { updateBudget } = await import("@/lib/actions/budgets");
    expect(await updateBudget(groceriesBudget, { categoryId: groceries, amount: "500", period: "monthly" })).toEqual({ ok: true });
    expect(await left()).toEqual([rentBudget]);
  });

  it("a failed budget edit keeps the dismissals", async () => {
    const { updateBudget } = await import("@/lib/actions/budgets");
    expect((await updateBudget(groceriesBudget, { categoryId: groceries, amount: "0", period: "monthly" })).ok).toBe(false);
    expect(await left()).toHaveLength(2);
  });

  it("deleting an expense clears the dismissals of its category's budget only", async () => {
    const { deleteTransaction } = await import("@/lib/actions/transactions");
    expect(await deleteTransaction(await expense(groceries))).toEqual({ ok: true });
    expect(await left()).toEqual([rentBudget]);
  });

  it("updating an expense clears both its old and its new category's budgets", async () => {
    const { updateTransaction } = await import("@/lib/actions/transactions");
    expect(await updateTransaction(await expense(groceries), form(rent))).toEqual({ ok: true });
    expect(await left()).toEqual([]);
  });

  it("updating an expense keeps other categories' dismissals", async () => {
    const { updateTransaction } = await import("@/lib/actions/transactions");
    const transport = await categoryIdByName(ann.id, "Transport");
    expect(await updateTransaction(await expense(transport), form(transport))).toEqual({ ok: true });
    expect(await left()).toHaveLength(2);
  });

  describe("only the period that contains the expense", () => {
    const old = "2026-07-15"; // months before the dismissals' period (the current month)
    const oldStart = "2026-07-01";
    const oldMonday = "2026-07-13";
    let weeklyBudget: string;
    const periods = async () =>
      (await getDb().select().from(budgetAlertDismissals).where(eq(budgetAlertDismissals.userId, ann.id)))
        .map((row) => `${row.budgetId === groceriesBudget ? "groceries" : row.budgetId === weeklyBudget ? "weekly" : "rent"}@${row.periodStart}`)
        .sort();

    beforeEach(async () => {
      const [weekly] = await getDb()
        .insert(budgets)
        .values({ userId: ann.id, categoryId: groceries, amount: "50.00", period: "weekly" })
        .onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId, budgets.period], set: { amount: "50.00" } })
        .returning({ id: budgets.id });
      weeklyBudget = weekly.id;
      await getDb().insert(budgetAlertDismissals).values([
        { userId: ann.id, budgetId: groceriesBudget, periodStart: oldStart, level: "warning" },
        { userId: ann.id, budgetId: weeklyBudget, periodStart: oldMonday, level: "warning" },
        { userId: ann.id, budgetId: weeklyBudget, periodStart: "2026-07-20", level: "warning" },
        { userId: ann.id, budgetId: weeklyBudget, periodStart: periodRange("weekly", todayISO("UTC")).start, level: "warning" },
      ]);
    });
    afterAll(async () => {
      await getDb().delete(budgets).where(eq(budgets.id, weeklyBudget));
    });

    it("deleting an old expense keeps the dismissals of other periods", async () => {
      const { deleteTransaction } = await import("@/lib/actions/transactions");
      expect(await deleteTransaction(await expense(groceries, old))).toEqual({ ok: true });
      expect(await periods()).toEqual([
        `groceries@${start}`,
        `rent@${start}`,
        `weekly@2026-07-20`,
        `weekly@${periodRange("weekly", todayISO("UTC")).start}`,
      ].sort());
    });

    it("updating an expense clears the periods of its old and its new date", async () => {
      const { updateTransaction } = await import("@/lib/actions/transactions");
      const id = await expense(groceries, old);
      expect(await updateTransaction(id, { ...form(groceries), date: "2026-07-21" })).toEqual({ ok: true });
      // 07-15 (July, week of 07-13) and 07-21 (week of 07-20) lose their dismissals; this month's stay.
      expect(await periods()).toEqual([
        `groceries@${start}`,
        `rent@${start}`,
        `weekly@${periodRange("weekly", todayISO("UTC")).start}`,
      ].sort());
    });

    it("an old expense in another category touches nothing", async () => {
      const { deleteTransaction } = await import("@/lib/actions/transactions");
      const transport = await categoryIdByName(ann.id, "Transport");
      expect(await deleteTransaction(await expense(transport, old))).toEqual({ ok: true });
      expect(await periods()).toHaveLength(2 + 4 - 0);
    });
  });

  it("creating an expense or touching a missing one keeps the dismissals", async () => {
    const { createTransaction, deleteTransaction } = await import("@/lib/actions/transactions");
    expect(await createTransaction(form(groceries))).toEqual({ ok: true });
    expect((await deleteTransaction(missing)).ok).toBe(false);
    expect(await left()).toHaveLength(2);
  });
});
