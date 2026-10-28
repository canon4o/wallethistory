import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, householdMembers, households, tags, transactionTags, transactions, transfers } from "@/db/schema";
import {
  getBalanceOverTime,
  getCashFlow,
  getPeriodComparison,
  getSpendingByCategory,
} from "@/lib/data/reports";
import { UNCATEGORIZED_COLOR } from "@/lib/reports/constants";
import { parseComparison, type ReportFilters } from "@/lib/validation/reports";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const RANGE = { start: "2026-07-01", end: "2026-10-31" };
const filters = (extra: Partial<ReportFilters> = {}): ReportFilters => ({ range: RANGE, ...extra });

describe.skipIf(!TEST_DATABASE_URL)("report data", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let outsider: { id: string };
  let householdId: string;
  let cash: string;
  let savings: string;
  let bobCash: string;

  async function add(
    userId: string,
    row: { type: "income" | "expense"; amount: string; date: string; accountId?: string; category?: string; note?: string },
  ) {
    const [created] = await getDb()
      .insert(transactions)
      .values({
        userId,
        type: row.type,
        amount: row.amount,
        date: row.date,
        accountId: row.accountId ?? (await defaultAccountId(userId)),
        categoryId: row.category ? await categoryIdByName(userId, row.category) : null,
        note: row.note,
      })
      .returning({ id: transactions.id });
    return created.id;
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice", name: "Alice" });
    bob = await users.create({ label: "bob", name: "Bob" });
    outsider = await users.create({ label: "outsider" });
    cash = await defaultAccountId(alice.id);
    bobCash = await defaultAccountId(bob.id);
    [{ id: savings }] = await getDb()
      .insert(accounts)
      .values({ userId: alice.id, name: "Savings", type: "savings", color: "#1aaaba", icon: "piggy-bank", initialBalance: "1000.00" })
      .returning({ id: accounts.id });
    await getDb().update(accounts).set({ initialBalance: "250.00" }).where(eq(accounts.id, cash));

    // Alice: July .. October 2026
    await add(alice.id, { type: "income", amount: "3000.00", date: "2026-10-01", category: "Salary", note: "October pay" });
    await add(alice.id, { type: "expense", amount: "1000.00", date: "2026-10-02", category: "Rent" });
    await add(alice.id, { type: "expense", amount: "60.10", date: "2026-10-08", category: "Groceries", accountId: savings });
    const trip = await add(alice.id, { type: "expense", amount: "40.20", date: "2026-10-09", category: "Groceries", note: "50% off" });
    await add(alice.id, { type: "expense", amount: "12.00", date: "2026-10-10" });
    await add(alice.id, { type: "income", amount: "2900.00", date: "2026-09-01", category: "Salary" });
    await add(alice.id, { type: "expense", amount: "1000.00", date: "2026-09-02", category: "Rent" });
    await add(alice.id, { type: "expense", amount: "80.00", date: "2026-09-15", category: "Groceries" });
    await add(alice.id, { type: "expense", amount: "30.00", date: "2026-09-20", category: "Transport" });
    await add(alice.id, { type: "expense", amount: "500.00", date: "2026-07-05", category: "Rent" });
    // Outside the period: before it and after it
    await add(alice.id, { type: "income", amount: "70.00", date: "2026-06-30" });
    await add(alice.id, { type: "expense", amount: "200.00", date: "2026-11-01" });
    // Another user, outside any household with alice
    await add(outsider.id, { type: "income", amount: "99999.00", date: "2026-10-05" });

    const [tag] = await getDb().insert(tags).values({ userId: alice.id, name: "Trip" }).returning({ id: tags.id });
    await getDb().insert(transactionTags).values({ transactionId: trip, tagId: tag.id });

    // Transfers: 100 Cash -> Savings in September, 40 Savings -> Cash in October.
    await getDb().insert(transfers).values([
      { userId: alice.id, fromAccountId: cash, toAccountId: savings, amount: "100.00", date: "2026-09-10" },
      { userId: alice.id, fromAccountId: savings, toAccountId: cash, amount: "40.00", date: "2026-10-12" },
    ]);

    // Bob joins Alice's household with his own spending.
    [{ id: householdId }] = await getDb().insert(households).values({}).returning({ id: households.id });
    await getDb().insert(householdMembers).values([
      { householdId, userId: alice.id },
      { householdId, userId: bob.id },
    ]);
    await add(bob.id, { type: "expense", amount: "25.00", date: "2026-10-03", category: "Groceries" });
    await add(bob.id, { type: "income", amount: "100.00", date: "2026-10-04" });
  });

  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(getCashFlow(filters()))).toBe("/login");
    expect(await redirectTarget(getSpendingByCategory(filters(), "expense"))).toBe("/login");
    expect(await redirectTarget(getBalanceOverTime(filters()))).toBe("/login");
    expect(
      await redirectTarget(getPeriodComparison(filters(), parseComparison({}, "2026-10-08"), "expense")),
    ).toBe("/login");
  });

  describe("cash flow", () => {
    it("lists every month of the period with income, expenses and net, and totals them", async () => {
      await signInAs(alice.id);
      const data = await getCashFlow(filters({ personId: alice.id }));
      expect(data.months).toEqual([
        { month: "2026-07-01", income: "0.00", expense: "500.00", net: "-500.00" },
        { month: "2026-08-01", income: "0.00", expense: "0.00", net: "0.00" },
        { month: "2026-09-01", income: "2900.00", expense: "1110.00", net: "1790.00" },
        { month: "2026-10-01", income: "3000.00", expense: "1112.30", net: "1887.70" },
      ]);
      expect(data).toMatchObject({ income: "5900.00", expense: "2722.30", net: "3177.70", hasData: true });
      expect(data.savingsRate).toBeCloseTo(3177.7 / 5900, 6);
    });

    it("leaves transfers out of income and expenses", async () => {
      await signInAs(alice.id);
      const data = await getCashFlow(filters({ personId: alice.id, range: { start: "2026-09-01", end: "2026-09-30" } }));
      expect(data).toMatchObject({ income: "2900.00", expense: "1110.00" });
    });

    it("covers the whole household by default and a single person on request", async () => {
      await signInAs(alice.id);
      const household = await getCashFlow(filters({ range: { start: "2026-10-01", end: "2026-10-31" } }));
      expect(household).toMatchObject({ income: "3100.00", expense: "1137.30" });
      const bobOnly = await getCashFlow(filters({ personId: bob.id, range: { start: "2026-10-01", end: "2026-10-31" } }));
      expect(bobOnly).toMatchObject({ income: "100.00", expense: "25.00" });
      // Someone outside the household is ignored, never exposed.
      const stranger = await getCashFlow(filters({ personId: outsider.id, range: { start: "2026-10-01", end: "2026-10-31" } }));
      expect(stranger).toMatchObject({ income: "3100.00", expense: "1137.30" });
    });

    it("narrows by account, category, tag and note text", async () => {
      await signInAs(alice.id);
      const october = { range: { start: "2026-10-01", end: "2026-10-31" }, personId: alice.id };
      expect(await getCashFlow(filters({ ...october, accountId: savings }))).toMatchObject({ income: "0.00", expense: "60.10" });
      expect(await getCashFlow(filters({ ...october, category: "expense:groceries" }))).toMatchObject({ expense: "100.30" });
      expect(await getCashFlow(filters({ ...october, category: "expense:" }))).toMatchObject({ hasData: false });
      expect(await getCashFlow(filters({ ...october, tag: "trip" }))).toMatchObject({ expense: "40.20" });
      expect(await getCashFlow(filters({ ...october, q: "50%" }))).toMatchObject({ expense: "40.20" });
      expect(await getCashFlow(filters({ ...october, q: "5_ off" }))).toMatchObject({ hasData: false });
    });

    it("has no data and no savings rate when nothing matches", async () => {
      await signInAs(alice.id);
      const data = await getCashFlow(filters({ range: { start: "2025-01-01", end: "2025-02-28" } }));
      expect(data.hasData).toBe(false);
      expect(data.savingsRate).toBeNull();
      expect(data.months.map((m) => m.month)).toEqual(["2025-01-01", "2025-02-01"]);
    });
  });

  describe("spending by category", () => {
    const october = { range: { start: "2026-10-01", end: "2026-10-31" }, personId: undefined };

    it("ranks categories with their share and the change from the previous month", async () => {
      await signInAs(alice.id);
      const data = await getSpendingByCategory(filters({ ...october, personId: alice.id }), "expense");
      expect(data.previous).toEqual({ start: "2026-09-01", end: "2026-09-30" });
      expect(data).toMatchObject({ totalA: "1112.30", totalB: "1110.00" });
      expect(data.rows.map((row) => [row.name, row.a, row.b, row.key])).toEqual([
        ["Rent", "1000.00", "1000.00", "expense:Rent"],
        ["Groceries", "100.30", "80.00", "expense:Groceries"],
        ["Uncategorized", "12.00", "0.00", null],
      ]);
      const groceries = data.rows.find((row) => row.name === "Groceries");
      expect(groceries?.share).toBeCloseTo(100.3 / 1112.3, 6);
      expect(groceries?.delta).toBe("20.30");
      expect(groceries?.change).toBeCloseTo(0.25375, 6);
      const uncategorized = data.rows.find((row) => row.key === null);
      expect(uncategorized).toMatchObject({ color: UNCATEGORIZED_COLOR, icon: null, change: null });
    });

    it("leaves out categories that only had spending in the previous period", async () => {
      await signInAs(alice.id);
      const data = await getSpendingByCategory(filters({ ...october, personId: alice.id }), "expense");
      expect(data.rows.map((row) => row.name)).not.toContain("Transport");
    });

    it("ranks income categories too and matches categories by name across the household", async () => {
      await signInAs(alice.id);
      const income = await getSpendingByCategory(filters(october), "income");
      expect(income.rows.map((row) => [row.name, row.a])).toEqual([
        ["Salary", "3000.00"],
        ["Uncategorized", "100.00"],
      ]);
      const expenses = await getSpendingByCategory(filters(october), "expense");
      expect(expenses.rows.find((row) => row.name === "Groceries")?.a).toBe("125.30");
    });

    it("compares a range that is not whole months with the same number of days before it", async () => {
      await signInAs(alice.id);
      const data = await getSpendingByCategory(
        filters({ range: { start: "2026-10-08", end: "2026-10-14" }, personId: alice.id }),
        "expense",
      );
      expect(data.previous).toEqual({ start: "2026-10-01", end: "2026-10-07" });
      expect(data.totalA).toBe("112.30");
      expect(data.totalB).toBe("1000.00");
    });

    it("is empty when nothing matches", async () => {
      await signInAs(alice.id);
      const data = await getSpendingByCategory(filters({ category: "income:Nope" }), "expense");
      expect(data).toMatchObject({ rows: [], totalA: "0.00", totalB: "0.00" });
    });
  });

  describe("period comparison", () => {
    it("compares two months: totals and every category's difference", async () => {
      await signInAs(alice.id);
      const comparison = parseComparison({ a: "2026-10", b: "2026-09" }, "2026-10-08");
      const data = await getPeriodComparison(filters({ personId: alice.id }), comparison, "expense");
      expect(data.income).toEqual({ a: "3000.00", b: "2900.00" });
      expect(data.expense).toEqual({ a: "1112.30", b: "1110.00" });
      expect(data.net).toEqual({ a: "1887.70", b: "1790.00" });
      // Transport only appears in September, and still shows up with a zero for October.
      expect(data.categories.map((row) => [row.name, row.a, row.b, row.delta])).toEqual([
        ["Rent", "1000.00", "1000.00", "0.00"],
        ["Groceries", "100.30", "80.00", "20.30"],
        ["Uncategorized", "12.00", "0.00", "12.00"],
        ["Transport", "0.00", "30.00", "-30.00"],
      ]);
    });

    it("compares two years, and ignores the period filter of the page", async () => {
      await signInAs(alice.id);
      const comparison = parseComparison({ mode: "year", a: "2026", b: "2025" }, "2026-10-08");
      const data = await getPeriodComparison(filters({ personId: alice.id }), comparison, "income");
      expect(data.income).toEqual({ a: "5970.00", b: "0.00" });
      expect(data.categories.map((row) => [row.name, row.a, row.b, row.change])).toEqual([
        ["Salary", "5900.00", "0.00", null],
        ["Uncategorized", "70.00", "0.00", null],
      ]);
    });
  });

  describe("balance over time", () => {
    it("shows the balance at the end of each month, per account and in total, with transfers", async () => {
      await signInAs(alice.id);
      const data = await getBalanceOverTime(filters({ personId: alice.id }));
      expect(data.months).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
      // Opening: 250 + 1000 initial balances + 70 income on 2026-06-30.
      expect(data.opening).toBe("1320.00");
      const byName = Object.fromEntries(data.accounts.map((account) => [account.name, account.values]));
      expect(byName.Cash).toEqual(["-180.00", "-180.00", "1510.00", "3497.80"]);
      expect(byName.Savings).toEqual(["1000.00", "1000.00", "1100.00", "999.90"]);
      expect(data.total).toEqual(["820.00", "820.00", "2610.00", "4497.70"]);
      // Transfers move money between accounts, so the change equals the period's net cash flow.
      expect(data.change).toBe("3177.70");
      expect(data.accounts.map((account) => account.ownerName)).toEqual(Array(2).fill(undefined));
    });

    it("can show a single account", async () => {
      await signInAs(alice.id);
      const data = await getBalanceOverTime(filters({ personId: alice.id, accountId: savings }));
      expect(data.accounts.map((account) => account.name)).toEqual(["Savings"]);
      expect(data.total).toEqual(["1000.00", "1000.00", "1100.00", "999.90"]);
    });

    it("covers the household by default and names each account's owner", async () => {
      await signInAs(alice.id);
      const data = await getBalanceOverTime(filters({ range: { start: "2026-10-01", end: "2026-10-31" } }));
      const rows = data.accounts.map((account) => [account.name, account.ownerName, account.values]);
      expect(rows).toHaveLength(3);
      expect(rows).toEqual(
        expect.arrayContaining([
          ["Cash", "Alice", ["3497.80"]],
          ["Savings", "Alice", ["999.90"]],
          ["Cash", "Bob", ["75.00"]],
        ]),
      );
      expect(data.total).toEqual(["4572.70"]);
    });

    it("is empty for someone else's account", async () => {
      await signInAs(alice.id);
      const data = await getBalanceOverTime(filters({ accountId: await defaultAccountId(outsider.id) }));
      expect(data.accounts).toEqual([]);
      expect(data.total).toEqual(["0.00", "0.00", "0.00", "0.00"]);
      expect(data).toMatchObject({ opening: "0.00", change: "0.00" });
    });

    it("shows one person's own accounts only", async () => {
      await signInAs(bob.id);
      const data = await getBalanceOverTime(filters({ personId: bob.id, range: { start: "2026-10-01", end: "2026-10-31" } }));
      expect(data.total).toEqual(["75.00"]);
      expect(bobCash).toBe(data.accounts[0].id);
    });
  });
});
