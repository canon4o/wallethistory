import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { accounts, tags, transactionTags, transactions, transfers } from "@/db/schema";
import { listTransactions } from "@/lib/data/transactions";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const none = { page: 1 };

describe.skipIf(!TEST_DATABASE_URL)("listTransactions with transfers", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let cash: string;
  let bank: string;
  let savings: string;
  let tagA: string;

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    cash = await defaultAccountId(alice.id);
    [{ id: bank }, { id: savings }] = await getDb()
      .insert(accounts)
      .values([
        { userId: alice.id, name: "Bank", type: "bank", color: "#337ab7", icon: "landmark" },
        { userId: alice.id, name: "Savings", type: "savings", color: "#337ab7", icon: "landmark" },
      ])
      .returning({ id: accounts.id });
    const groceries = await categoryIdByName(alice.id, "Groceries");
    [{ id: tagA }] = await getDb().insert(tags).values({ userId: alice.id, name: "alpha" }).returning({ id: tags.id });
    const [expense] = await getDb()
      .insert(transactions)
      .values({ userId: alice.id, type: "expense", amount: "5.00", date: "2026-03-02", accountId: cash, categoryId: groceries, note: "shop" })
      .returning({ id: transactions.id });
    await getDb().insert(transactionTags).values({ transactionId: expense.id, tagId: tagA });
    await getDb().insert(transfers).values([
      { userId: alice.id, fromAccountId: cash, toAccountId: bank, amount: "20.00", date: "2026-03-03", note: "to bank" },
      { userId: alice.id, fromAccountId: bank, toAccountId: savings, amount: "7.50", date: "2026-03-01", note: "save 50%" },
    ]);
    await signInAs(alice.id);
  });
  afterAll(users.cleanup);

  it("merges transfers and transactions newest first", async () => {
    const { items, total } = await listTransactions(none);
    expect(total).toBe(3);
    expect(items.map((i) => [i.type, i.note])).toEqual([
      ["transfer", "to bank"],
      ["expense", "shop"],
      ["transfer", "save 50%"],
    ]);
    expect(items[0]).toMatchObject({
      amount: "20.00",
      category: null,
      tags: [],
      account: { id: cash, name: "Cash" },
      transferTo: { id: bank, name: "Bank" },
    });
    expect(items[1].transferTo).toBeNull();
    expect(items[1].tags).toHaveLength(1);
  });

  it("filters by the transfer type, and income/expense exclude transfers", async () => {
    expect((await listTransactions({ ...none, type: "transfer" })).items.map((i) => i.note)).toEqual(["to bank", "save 50%"]);
    expect((await listTransactions({ ...none, type: "expense" })).items.map((i) => i.note)).toEqual(["shop"]);
    expect((await listTransactions({ ...none, type: "income" })).total).toBe(0);
  });

  it("matches a transfer under either of its accounts", async () => {
    expect((await listTransactions({ ...none, accountId: bank })).items.map((i) => i.note)).toEqual(["to bank", "save 50%"]);
    expect((await listTransactions({ ...none, accountId: cash })).items.map((i) => i.note)).toEqual(["to bank", "shop"]);
    expect((await listTransactions({ ...none, accountId: savings })).items.map((i) => i.note)).toEqual(["save 50%"]);
  });

  it("hides transfers when filtering by category or tag, and applies dates and search", async () => {
    const groceries = await categoryIdByName(alice.id, "Groceries");
    expect((await listTransactions({ ...none, category: groceries })).items.map((i) => i.note)).toEqual(["shop"]);
    expect((await listTransactions({ ...none, tag: tagA })).items.map((i) => i.note)).toEqual(["shop"]);
    expect((await listTransactions({ ...none, from: "2026-03-02", to: "2026-03-03" })).total).toBe(2);
    expect((await listTransactions({ ...none, q: "50%" })).items.map((i) => i.note)).toEqual(["save 50%"]);
    expect((await listTransactions({ ...none, type: "transfer", category: groceries })).total).toBe(0);
  });

  it("pages across both tables", async () => {
    const first = await listTransactions(none, 2);
    expect(first).toMatchObject({ total: 3, page: 1, pageCount: 2 });
    expect(first.items).toHaveLength(2);
    const second = await listTransactions({ page: 2 }, 2);
    expect(second.items.map((i) => i.note)).toEqual(["save 50%"]);
  });
});
