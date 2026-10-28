import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, tags, transactionTags, transactions } from "@/db/schema";
import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { listAccounts } from "@/lib/data/accounts";
import { listTransactions } from "@/lib/data/transactions";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("transaction actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let cash: string;
  let bank: string;
  let rent: string; // expense category
  let salary: string; // income category
  let tagA: string;
  let tagB: string;
  let bobAccount: string;
  let bobCategory: string;
  let bobTag: string;

  const valid = () => ({
    type: "expense",
    amount: "12.5",
    date: "2026-03-04",
    accountId: cash,
    categoryId: rent,
    tagIds: [tagA],
    note: "  lunch ",
  });

  async function rowOf(id: string) {
    const [row] = await getDb().select().from(transactions).where(eq(transactions.id, id));
    return row;
  }
  async function tagIdsOf(id: string) {
    const rows = await getDb().select().from(transactionTags).where(eq(transactionTags.transactionId, id));
    return rows.map((r) => r.tagId).sort();
  }
  async function createdId(input: object) {
    expect(await createTransaction(input)).toEqual({ ok: true });
    const { items } = await listTransactions({ page: 1 });
    return items[0].id;
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    cash = await defaultAccountId(alice.id);
    [{ id: bank }] = await getDb().insert(accounts).values({ userId: alice.id, name: "Bank", type: "bank", color: "#337ab7", icon: "landmark" }).returning({ id: accounts.id });
    rent = await categoryIdByName(alice.id, "Rent");
    salary = await categoryIdByName(alice.id, "Salary");
    [{ id: tagA }, { id: tagB }] = await getDb().insert(tags).values([{ userId: alice.id, name: "a" }, { userId: alice.id, name: "b" }]).returning({ id: tags.id });
    bobAccount = await defaultAccountId(bob.id);
    bobCategory = await categoryIdByName(bob.id, "Rent");
    [{ id: bobTag }] = await getDb().insert(tags).values({ userId: bob.id, name: "bobs" }).returning({ id: tags.id });
  });
  beforeEach(async () => {
    await signInAs(alice.id);
    vi.mocked(revalidatePath).mockClear();
  });
  afterAll(users.cleanup);

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(createTransaction(valid()))).toBe("/login");
    expect(await redirectTarget(updateTransaction(missing, valid()))).toBe("/login");
    expect(await redirectTarget(deleteTransaction(missing))).toBe("/login");
  });

  describe("create", () => {
    it("creates a normalized transaction with tags for the current user", async () => {
      const id = await createdId(valid());
      expect(await rowOf(id)).toMatchObject({
        userId: alice.id,
        type: "expense",
        amount: "12.50",
        date: "2026-03-04",
        accountId: cash,
        categoryId: rent,
        note: "lunch",
      });
      expect(await tagIdsOf(id)).toEqual([tagA]);
    });

    it("allows no category, no note and no tags", async () => {
      const id = await createdId({ ...valid(), categoryId: "", note: "", tagIds: [] });
      expect(await rowOf(id)).toMatchObject({ categoryId: null, note: null });
      expect(await tagIdsOf(id)).toEqual([]);
    });

    it("accepts already-normalized null category and note, as the form sends them", async () => {
      const id = await createdId({ ...valid(), categoryId: null, note: null, tagIds: [] });
      expect(await rowOf(id)).toMatchObject({ categoryId: null, note: null });
    });

    it("stores several tags and ignores duplicates", async () => {
      const id = await createdId({ ...valid(), tagIds: [tagA, tagB, tagA] });
      expect(await tagIdsOf(id)).toEqual([tagA, tagB].sort());
    });

    it("refreshes the pages that show transaction data", async () => {
      await createdId(valid());
      const paths = vi.mocked(revalidatePath).mock.calls.map(([path]) => path);
      expect(paths).toEqual(expect.arrayContaining(["/transactions", "/profile/accounts", "/dashboard", "/budgets"]));
    });

    it("changes the account balance: income adds, expense subtracts", async () => {
      await createdId({ ...valid(), accountId: bank, amount: "100" , type: "income", categoryId: salary, tagIds: [] });
      await createdId({ ...valid(), accountId: bank, amount: "30.25", tagIds: [] });
      const balance = (await listAccounts()).find((a) => a.id === bank)!.balance;
      expect(balance).toBe("69.75");
    });

    it("returns field errors for invalid input and writes nothing", async () => {
      const before = (await listTransactions({ page: 1 })).total;
      const result = await createTransaction({ type: "x", amount: "0", date: "2026-02-30", accountId: "", categoryId: "nope", tagIds: ["nope"], note: "x".repeat(501) });
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: {
          type: expect.any(Array),
          amount: expect.any(Array),
          date: expect.any(Array),
          accountId: expect.any(Array),
          categoryId: expect.any(Array),
          tagIds: expect.any(Array),
          note: expect.any(Array),
        },
      });
      expect((await listTransactions({ page: 1 })).total).toBe(before);
    });

    it("rejects a category of the other type, with a clear message", async () => {
      expect(await createTransaction({ ...valid(), type: "expense", categoryId: salary })).toMatchObject({
        ok: false,
        fieldErrors: { categoryId: ["Choose an expense category for an expense transaction"] },
      });
      expect(await createTransaction({ ...valid(), type: "income", categoryId: rent })).toMatchObject({
        ok: false,
        fieldErrors: { categoryId: ["Choose an income category for an income transaction"] },
      });
    });

    it("rejects another user's account, category and tag (tampered ids)", async () => {
      const before = (await listTransactions({ page: 1 })).total;
      expect(await createTransaction({ ...valid(), accountId: bobAccount })).toMatchObject({
        ok: false,
        fieldErrors: { accountId: ["Choose one of your accounts"] },
      });
      expect(await createTransaction({ ...valid(), categoryId: bobCategory })).toMatchObject({
        ok: false,
        fieldErrors: { categoryId: ["Choose one of your categories"] },
      });
      expect(await createTransaction({ ...valid(), tagIds: [tagA, bobTag] })).toMatchObject({
        ok: false,
        fieldErrors: { tagIds: ["Choose from your own tags"] },
      });
      expect(await createTransaction({ ...valid(), accountId: missing })).toMatchObject({ ok: false });
      expect((await listTransactions({ page: 1 })).total).toBe(before);
      // Nothing was written for Bob either.
      expect(await getDb().select().from(transactions).where(eq(transactions.userId, bob.id))).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates every field and replaces the tags", async () => {
      const id = await createdId({ ...valid(), tagIds: [tagA] });
      expect(
        await updateTransaction(id, {
          type: "income",
          amount: "250",
          date: "2026-04-01",
          accountId: bank,
          categoryId: salary,
          tagIds: [tagB],
          note: "bonus",
        }),
      ).toEqual({ ok: true });
      expect(await rowOf(id)).toMatchObject({
        type: "income",
        amount: "250.00",
        date: "2026-04-01",
        accountId: bank,
        categoryId: salary,
        note: "bonus",
        userId: alice.id,
      });
      expect(await tagIdsOf(id)).toEqual([tagB]);
    });

    it("can remove the category, note and all tags", async () => {
      const id = await createdId({ ...valid(), tagIds: [tagA, tagB] });
      expect(await updateTransaction(id, { ...valid(), categoryId: "", note: "", tagIds: [] })).toEqual({ ok: true });
      expect(await rowOf(id)).toMatchObject({ categoryId: null, note: null });
      expect(await tagIdsOf(id)).toEqual([]);
    });

    it("rejects a type change that leaves a mismatched category", async () => {
      const id = await createdId(valid());
      expect(await updateTransaction(id, { ...valid(), type: "income" })).toMatchObject({
        ok: false,
        fieldErrors: { categoryId: expect.any(Array) },
      });
      expect((await rowOf(id)).type).toBe("expense");
    });

    it("validates input and references like create does", async () => {
      const id = await createdId(valid());
      expect(await updateTransaction(id, { ...valid(), amount: "-5" })).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(Array) } });
      expect(await updateTransaction(id, { ...valid(), accountId: bobAccount })).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(Array) } });
      expect(await updateTransaction(id, { ...valid(), tagIds: [bobTag] })).toMatchObject({ ok: false, fieldErrors: { tagIds: expect.any(Array) } });
      expect((await rowOf(id)).amount).toBe("12.50");
    });

    it("cannot update another user's transaction (tampered id) and leaves it untouched", async () => {
      await signInAs(bob.id);
      const bobsId = await createdId({ type: "expense", amount: "5", date: "2026-01-01", accountId: bobAccount, categoryId: bobCategory, tagIds: [bobTag], note: "bobs" });
      await signInAs(alice.id);
      expect(await updateTransaction(bobsId, valid())).toEqual({ ok: false, error: "This item no longer exists." });
      expect(await rowOf(bobsId)).toMatchObject({ amount: "5.00", note: "bobs", userId: bob.id });
      expect(await tagIdsOf(bobsId)).toEqual([bobTag]);
    });

    it("treats malformed and unknown ids as not found and keeps other tags intact", async () => {
      expect(await updateTransaction("nope", valid())).toMatchObject({ ok: false });
      expect(await updateTransaction(undefined, valid())).toMatchObject({ ok: false });
      expect(await updateTransaction(missing, valid())).toMatchObject({ ok: false, error: "This item no longer exists." });
    });
  });

  describe("delete", () => {
    it("deletes the transaction and detaches its tags", async () => {
      const id = await createdId({ ...valid(), tagIds: [tagA, tagB] });
      expect(await deleteTransaction(id)).toEqual({ ok: true });
      expect(await rowOf(id)).toBeUndefined();
      expect(await tagIdsOf(id)).toEqual([]);
      // The tags themselves remain.
      expect(await getDb().select().from(tags).where(eq(tags.id, tagA))).toHaveLength(1);
    });

    it("cannot delete another user's transaction (tampered id)", async () => {
      await signInAs(bob.id);
      const bobsId = await createdId({ type: "expense", amount: "5", date: "2026-01-01", accountId: bobAccount, tagIds: [], categoryId: "", note: "" });
      await signInAs(alice.id);
      expect(await deleteTransaction(bobsId)).toEqual({ ok: false, error: "This item no longer exists." });
      expect(await rowOf(bobsId)).toBeDefined();
    });

    it("treats malformed and unknown ids as not found", async () => {
      expect(await deleteTransaction("1 OR 1=1")).toMatchObject({ ok: false });
      expect(await deleteTransaction(undefined)).toMatchObject({ ok: false });
      expect(await deleteTransaction(missing)).toMatchObject({ ok: false, error: "This item no longer exists." });
    });
  });
});
