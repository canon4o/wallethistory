import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, budgets, recurringRules, transactions } from "@/db/schema";
import { DASHBOARD_BUDGET_LIMIT, DASHBOARD_RECENT_LIMIT, DASHBOARD_RECURRING_LIMIT, getDashboard } from "@/lib/data/dashboard";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

// Thursday 2026-10-08: the week is 2026-10-05 .. 2026-10-11 and the month is October 2026.
const TODAY = "2026-10-08";

describe.skipIf(!TEST_DATABASE_URL)("getDashboard", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };

  async function add(
    userId: string,
    row: { type: "income" | "expense"; amount: string; date: string; accountId?: string; category?: string; note?: string },
  ) {
    await getDb().insert(transactions).values({
      userId,
      type: row.type,
      amount: row.amount,
      date: row.date,
      accountId: row.accountId ?? (await defaultAccountId(userId)),
      categoryId: row.category ? await categoryIdByName(userId, row.category) : null,
      note: row.note,
    });
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
  });
  afterAll(users.cleanup);

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(getDashboard(TODAY))).toBe("/login");
  });

  it("is all zeros and empty lists for a user without activity (apart from the default account)", async () => {
    const empty = await users.create({ label: "empty" });
    await signInAs(empty.id);
    const data = await getDashboard(TODAY);
    expect(data).toMatchObject({
      month: { start: "2026-10-01", end: "2026-10-31" },
      totalBalance: "0.00",
      income: "0.00",
      expense: "0.00",
      net: "0.00",
      budgets: [],
      recurring: [],
      recent: [],
    });
    expect(data.accounts.map((a) => [a.name, a.balance])).toEqual([["Cash", "0.00"]]);
  });

  describe("with activity", () => {
    let savings: string;

    beforeAll(async () => {
      const cash = await defaultAccountId(alice.id);
      [{ id: savings }] = await getDb()
        .insert(accounts)
        .values({ userId: alice.id, name: "Savings", type: "savings", color: "#1aaaba", icon: "piggy-bank", initialBalance: "1000.00" })
        .returning({ id: accounts.id });
      await getDb().update(accounts).set({ initialBalance: "250.00" }).where(eq(accounts.id, cash));

      // This month
      await add(alice.id, { type: "income", amount: "3000.00", date: "2026-10-01", category: "Salary", note: "October pay" });
      await add(alice.id, { type: "expense", amount: "1100.50", date: "2026-10-02", category: "Rent" });
      await add(alice.id, { type: "expense", amount: "64.35", date: "2026-10-08", category: "Groceries", accountId: savings });
      // Month boundaries
      await add(alice.id, { type: "expense", amount: "10.00", date: "2026-10-31", category: "Groceries" });
      await add(alice.id, { type: "income", amount: "5.00", date: "2026-10-31" });
      // Other months: part of the balance, but not of this month's income and expense
      await add(alice.id, { type: "income", amount: "700.00", date: "2026-09-30" });
      await add(alice.id, { type: "expense", amount: "200.00", date: "2026-11-01" });
      // Another user
      await add(bob.id, { type: "income", amount: "99999.00", date: "2026-10-05" });
    });

    it("totals this month's income, expense and net, ignoring other months and other users", async () => {
      await signInAs(alice.id);
      const data = await getDashboard(TODAY);
      expect(data.income).toBe("3005.00");
      expect(data.expense).toBe("1174.85");
      expect(data.net).toBe("1830.15");
    });

    it("totals the balance over all accounts and all time (initial balances + income - expense)", async () => {
      await signInAs(alice.id);
      const data = await getDashboard(TODAY);
      // 250 + 1000 initial; + 3000 + 5 + 700 income; - 1100.50 - 64.35 - 10 - 200 expense
      expect(data.totalBalance).toBe("3580.15");
      // The per-account balances add up to the total.
      const sum = data.accounts.reduce((acc, a) => acc + Math.round(Number(a.balance) * 100), 0);
      expect(sum).toBe(358015);
      expect(data.accounts.find((a) => a.name === "Savings")?.balance).toBe("935.65");
    });

    it("includes this month's expenses per category and the last six months of cash flow", async () => {
      await signInAs(alice.id);
      const data = await getDashboard(TODAY);
      expect(data.spending.rows.map((row) => [row.name, row.a])).toEqual([
        ["Rent", "1100.50"],
        ["Groceries", "74.35"],
      ]);
      expect(data.spending.totalA).toBe("1174.85");
      expect(data.cashFlow.months.map((month) => month.month)).toEqual([
        "2026-05-01",
        "2026-06-01",
        "2026-07-01",
        "2026-08-01",
        "2026-09-01",
        "2026-10-01",
      ]);
      expect(data.cashFlow.months.at(-1)).toEqual({ month: "2026-10-01", income: "3005.00", expense: "1174.85", net: "1830.15" });
      expect(data.cashFlow.months.at(-2)).toMatchObject({ income: "700.00", expense: "0.00" });
    });

    it("compares with the same days of last month, saves a rate and trends the balance", async () => {
      await signInAs(alice.id);
      // October 8: last month's 1st to 8th. Alice has nothing then, so everything is zero.
      const early = await getDashboard(TODAY);
      expect(early.lastMonthToDate).toEqual({
        range: { start: "2026-09-01", end: "2026-09-08" },
        income: "0.00",
        expense: "0.00",
        net: "0.00",
      });
      expect(early.savingsRate).toBeCloseTo((3005 - 1174.85) / 3005, 6);
      expect(early.balanceTrend).toHaveLength(6);
      // Initial balances 1250, then September's 700 income, then October's net 1830.15 (the 200 spent on
      // November 1 is not part of the October balance).
      expect(early.balanceTrend.slice(-2)).toEqual(["1950.00", "3780.15"]);
      expect(early.balanceChange).toBe("1830.15");
      // November 20: October 1st to 20th, without the entries of October 31.
      const november = await getDashboard("2026-11-20");
      expect(november.lastMonthToDate).toMatchObject({ range: { start: "2026-10-01", end: "2026-10-20" }, income: "3000.00", expense: "1164.85" });
      // A short month: March 31 compares with all of February.
      const march = await getDashboard("2026-03-31");
      expect(march.lastMonthToDate.range).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    });

    it("has no savings rate without income", async () => {
      const quiet = await users.create({ label: "quiet" });
      await signInAs(quiet.id);
      const data = await getDashboard(TODAY);
      expect(data.savingsRate).toBeNull();
      expect(data.balanceChange).toBe("0.00");
    });

    it("looks at the month containing the given day", async () => {
      await signInAs(alice.id);
      const september = await getDashboard("2026-09-15");
      expect(september.month).toEqual({ start: "2026-09-01", end: "2026-09-30" });
      expect(september).toMatchObject({ income: "700.00", expense: "0.00", net: "700.00" });
      const november = await getDashboard("2026-11-20");
      expect(november).toMatchObject({ income: "0.00", expense: "200.00", net: "-200.00" });
    });

    it("lists the latest 5 transactions, newest first", async () => {
      await signInAs(alice.id);
      const { recent } = await getDashboard(TODAY);
      expect(DASHBOARD_RECENT_LIMIT).toBe(5);
      expect(recent).toHaveLength(5);
      expect(recent.map((r) => r.date)).toEqual(["2026-11-01", "2026-10-31", "2026-10-31", "2026-10-08", "2026-10-02"]);
      expect(recent.every((r) => r.account.name)).toBe(true);
    });

    it("shows the top budgets by usage, each over its own period, at most 5", async () => {
      await signInAs(alice.id);
      const insert = async (name: string, amount: string, period: "weekly" | "monthly") =>
        getDb().insert(budgets).values({ userId: alice.id, categoryId: await categoryIdByName(alice.id, name), amount, period });
      await insert("Rent", "1000.00", "monthly"); // 110%
      await insert("Groceries", "100.00", "weekly"); // 64.35%
      await insert("Groceries", "400.00", "monthly"); // 18.6%
      for (const name of ["Transport", "Travel", "Utilities", "Health"]) await insert(name, "50.00", "monthly"); // 0%

      const { budgets: top } = await getDashboard(TODAY);
      expect(DASHBOARD_BUDGET_LIMIT).toBe(5);
      expect(top).toHaveLength(5);
      expect(top[0]).toMatchObject({ category: { name: "Rent" }, spent: "1100.50", remaining: "-100.50" });
      expect(top[1]).toMatchObject({ category: { name: "Groceries" }, period: "weekly", spent: "64.35" });
      expect(top[2]).toMatchObject({ category: { name: "Groceries" }, period: "monthly", spent: "74.35" });
    });

    it("shows only the user's active recurring rules, soonest first, at most 5", async () => {
      await signInAs(alice.id);
      const cash = await defaultAccountId(alice.id);
      const rule = (nextDueDate: string, status: "active" | "paused" | "ended" = "active") => ({
        userId: alice.id,
        kind: "expense" as const,
        amount: "10.00",
        accountId: cash,
        frequency: "monthly" as const,
        startDate: "2026-01-01",
        nextDueDate,
        status,
        pausedReason: status === "paused" ? ("manual" as const) : null,
      });
      await getDb()
        .insert(recurringRules)
        .values([
          rule("2026-11-07"),
          rule("2026-11-02"),
          rule("2026-11-01", "paused"),
          rule("2026-11-03", "ended"),
          ...["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-08"].map((date) => rule(date)),
        ]);
      const { recurring } = await getDashboard(TODAY);
      expect(DASHBOARD_RECURRING_LIMIT).toBe(5);
      expect(recurring.map((r) => r.nextDueDate)).toEqual(["2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    });

    it("never includes another user's numbers", async () => {
      await signInAs(bob.id);
      const data = await getDashboard(TODAY);
      expect(data).toMatchObject({ income: "99999.00", expense: "0.00", totalBalance: "99999.00" });
      expect(data.budgets).toEqual([]);
      expect(data.recurring).toEqual([]);
      expect(data.recent).toHaveLength(1);
    });
  });
});
