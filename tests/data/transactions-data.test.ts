import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { accounts, tags, transactionTags, transactions } from "@/db/schema";
import { listTransactions, PAGE_SIZE } from "@/lib/data/transactions";
import { parseTransactionFilters } from "@/lib/validation/transactions";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const none = { page: 1 };

describe.skipIf(!TEST_DATABASE_URL)("listTransactions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let cash: string;
  let bank: string;
  let groceries: string;
  let salary: string;
  let tagA: string;
  let tagB: string;
  let bobAccount: string;
  let bobCategory: string;
  let bobTag: string;

  async function add(userId: string, row: Partial<typeof transactions.$inferInsert> & { date: string }) {
    const [created] = await getDb()
      .insert(transactions)
      .values({ userId, type: "expense", amount: "10.00", accountId: cash, ...row })
      .returning({ id: transactions.id });
    return created.id;
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    cash = await defaultAccountId(alice.id);
    [{ id: bank }] = await getDb().insert(accounts).values({ userId: alice.id, name: "Bank", type: "bank", color: "#337ab7", icon: "landmark" }).returning({ id: accounts.id });
    groceries = await categoryIdByName(alice.id, "Groceries");
    salary = await categoryIdByName(alice.id, "Salary");
    [{ id: tagA }, { id: tagB }] = await getDb().insert(tags).values([{ userId: alice.id, name: "alpha" }, { userId: alice.id, name: "beta" }]).returning({ id: tags.id });
    bobAccount = await defaultAccountId(bob.id);
    bobCategory = await categoryIdByName(bob.id, "Groceries");
    [{ id: bobTag }] = await getDb().insert(tags).values({ userId: bob.id, name: "bob-tag" }).returning({ id: tags.id });
    await add(bob.id, { date: "2026-01-10", accountId: bobAccount, categoryId: bobCategory, note: "bob secret" });
    const bobTxn = await add(bob.id, { date: "2026-01-11", accountId: bobAccount, note: "bob tagged" });
    await getDb().insert(transactionTags).values({ transactionId: bobTxn, tagId: bobTag });
  });
  afterAll(users.cleanup);

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(listTransactions(none))).toBe("/login");
  });

  it("returns an empty first page for a user without transactions", async () => {
    await signInAs(alice.id);
    expect(await listTransactions(none)).toEqual({ items: [], total: 0, page: 1, pageCount: 1 });
  });

  describe("with data", () => {
    beforeAll(async () => {
      const sunday = await add(alice.id, { date: "2026-03-01", amount: "1000.50", type: "income", categoryId: salary, note: "March salary" });
      await add(alice.id, { date: "2026-03-05", amount: "42.00", categoryId: groceries, note: "Weekly shop 50% off", accountId: bank });
      const tagged = await add(alice.id, { date: "2026-03-05", amount: "7.25", note: "coffee_beans" });
      await add(alice.id, { date: "2026-02-20", amount: "99.99", note: "Old thing" });
      await add(alice.id, { date: "2026-03-31", amount: "5.00" }); // no category, no note
      await getDb().insert(transactionTags).values([
        { transactionId: tagged, tagId: tagB },
        { transactionId: tagged, tagId: tagA },
        { transactionId: sunday, tagId: tagA },
      ]);
    });

    it("lists newest first, with account, category and tags", async () => {
      await signInAs(alice.id);
      const { items, total } = await listTransactions(none);
      expect(total).toBe(5);
      expect(items.map((i) => i.date)).toEqual(["2026-03-31", "2026-03-05", "2026-03-05", "2026-03-01", "2026-02-20"]);

      const salaryRow = items.find((i) => i.note === "March salary")!;
      expect(salaryRow).toMatchObject({
        type: "income",
        amount: "1000.50",
        account: { id: cash, name: "Cash" },
        category: { id: salary, name: "Salary", icon: "banknote", color: "#9cca56" },
        tags: [{ id: tagA, name: "alpha" }],
      });
      const shop = items.find((i) => i.note?.startsWith("Weekly"))!;
      expect(shop.account).toEqual({ id: bank, name: "Bank", ownerName: "Test User", isMine: true });
    });

    it("orders same-day transactions by creation time, newest first", async () => {
      await signInAs(alice.id);
      const { items } = await listTransactions(none);
      const sameDay = items.filter((i) => i.date === "2026-03-05").map((i) => i.note);
      expect(sameDay).toEqual(["coffee_beans", "Weekly shop 50% off"]);
    });

    it("returns tags sorted by name, and an empty list or null category when there are none", async () => {
      await signInAs(alice.id);
      const { items } = await listTransactions(none);
      expect(items.find((i) => i.note === "coffee_beans")!.tags.map((t) => t.name)).toEqual(["alpha", "beta"]);
      const bare = items.find((i) => i.date === "2026-03-31")!;
      expect(bare).toMatchObject({ category: null, note: null, tags: [] });
    });

    it("filters by date range (inclusive)", async () => {
      await signInAs(alice.id);
      const march = await listTransactions({ ...none, from: "2026-03-01", to: "2026-03-05" });
      expect(march.items.map((i) => i.date)).toEqual(["2026-03-05", "2026-03-05", "2026-03-01"]);
      expect((await listTransactions({ ...none, to: "2026-02-28" })).total).toBe(1);
      expect((await listTransactions({ ...none, from: "2026-03-31" })).total).toBe(1);
      expect((await listTransactions({ ...none, from: "2026-04-01" })).total).toBe(0);
    });

    it("filters by type, account, category and tag", async () => {
      await signInAs(alice.id);
      expect((await listTransactions({ ...none, type: "income" })).total).toBe(1);
      expect((await listTransactions({ ...none, type: "expense" })).total).toBe(4);
      expect((await listTransactions({ ...none, accountId: bank })).total).toBe(1);
      expect((await listTransactions({ ...none, category: groceries })).total).toBe(1);
      const byTag = await listTransactions({ ...none, tag: tagA });
      expect(byTag.items.map((i) => i.note).sort()).toEqual(["March salary", "coffee_beans"]);
      // Filtering by a tag still shows all of the transaction's tags.
      expect(byTag.items.find((i) => i.note === "coffee_beans")!.tags).toHaveLength(2);
    });

    it("searches notes case-insensitively and treats % and _ literally", async () => {
      await signInAs(alice.id);
      expect((await listTransactions({ ...none, q: "march SALARY" })).total).toBe(1);
      expect((await listTransactions({ ...none, q: "MARCH sal" })).total).toBe(1);
      expect((await listTransactions({ ...none, q: "march  salary" })).total).toBe(0);
      expect((await listTransactions({ ...none, q: "50%" })).items.map((i) => i.note)).toEqual(["Weekly shop 50% off"]);
      expect((await listTransactions({ ...none, q: "%" })).total).toBe(1);
      expect((await listTransactions({ ...none, q: "coffee_b" })).total).toBe(1);
      expect((await listTransactions({ ...none, q: "_" })).total).toBe(1);
      expect((await listTransactions({ ...none, q: "coffeeXbeans" })).total).toBe(0);
      expect((await listTransactions({ ...none, q: "a\\b" })).total).toBe(0);
    });

    it("combines filters", async () => {
      await signInAs(alice.id);
      const result = await listTransactions({ ...none, type: "expense", from: "2026-03-01", accountId: cash, tag: tagB });
      expect(result.items.map((i) => i.note)).toEqual(["coffee_beans"]);
    });

    it("never returns another user's transactions or tags, even with their ids in the filters", async () => {
      await signInAs(alice.id);
      const all = await listTransactions(none);
      expect(all.items.every((i) => !i.note?.startsWith("bob"))).toBe(true);
      expect(all.total).toBe(5);

      expect((await listTransactions({ ...none, accountId: bobAccount })).total).toBe(0);
      expect((await listTransactions({ ...none, category: bobCategory })).total).toBe(0);
      expect((await listTransactions({ ...none, tag: bobTag })).total).toBe(0);
      expect((await listTransactions({ ...none, q: "bob" })).total).toBe(0);

      await signInAs(bob.id);
      const bobs = await listTransactions(none);
      expect(bobs.items.map((i) => i.note).sort()).toEqual(["bob secret", "bob tagged"]);
      expect(bobs.items.find((i) => i.note === "bob tagged")!.tags).toEqual([{ id: bobTag, name: "bob-tag" }]);
    });
  });

  describe("pagination", () => {
    let carol: { id: string };

    beforeAll(async () => {
      carol = await users.create({ label: "carol" });
      const account = await defaultAccountId(carol.id);
      await getDb().insert(transactions).values(
        Array.from({ length: 45 }, (_, i) => ({
          userId: carol.id,
          accountId: account,
          type: "expense" as const,
          amount: "1.00",
          // 2026-04-01 .. 2026-04-30, then 2026-05-01 .. 2026-05-15: each day is unique.
          date: new Date(Date.UTC(2026, 3, 1 + i)).toISOString().slice(0, 10),
          note: `n${i}`,
        })),
      );
    });

    it("uses a page size of 20", () => {
      expect(PAGE_SIZE).toBe(20);
    });

    it("splits 45 transactions into 3 pages, newest first", async () => {
      await signInAs(carol.id);
      const first = await listTransactions({ page: 1 });
      expect(first).toMatchObject({ total: 45, page: 1, pageCount: 3 });
      expect(first.items).toHaveLength(20);
      expect(first.items[0].note).toBe("n44");

      const second = await listTransactions({ page: 2 });
      expect(second.items).toHaveLength(20);
      expect(second.items[0].note).toBe("n24");

      const third = await listTransactions({ page: 3 });
      expect(third.items).toHaveLength(5);
      expect(third.items.at(-1)!.note).toBe("n0");

      const seen = new Set([...first.items, ...second.items, ...third.items].map((i) => i.id));
      expect(seen.size).toBe(45);
    });

    it("supports a custom page size (the dashboard shows the latest 5)", async () => {
      await signInAs(carol.id);
      const latest = await listTransactions({ page: 1 }, 5);
      expect(latest).toMatchObject({ total: 45, page: 1, pageCount: 9 });
      expect(latest.items.map((i) => i.note)).toEqual(["n44", "n43", "n42", "n41", "n40"]);
      expect((await listTransactions({ page: 9 }, 5)).items.map((i) => i.note)).toEqual(["n4", "n3", "n2", "n1", "n0"]);
    });

    it("clamps a page beyond the end to the last page", async () => {
      await signInAs(carol.id);
      const result = await listTransactions({ page: 999 });
      expect(result).toMatchObject({ page: 3, pageCount: 3 });
      expect(result.items).toHaveLength(5);
    });

    it("counts only the filtered rows", async () => {
      await signInAs(carol.id);
      const result = await listTransactions(parseTransactionFilters({ q: "n4", page: "1" }));
      // n4, n40..n44
      expect(result.total).toBe(6);
      expect(result.pageCount).toBe(1);
    });
  });
});
