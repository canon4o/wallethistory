import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgets, categories } from "@/db/schema";
import { createBudget, deleteBudget, updateBudget } from "@/lib/actions/budgets";
import { deleteCategory } from "@/lib/actions/categories";
import { categoryIdByName } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("budget actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let groceries: string;
  let rent: string;
  let salary: string; // income category
  let bobGroceries: string;

  const valid = () => ({ categoryId: groceries, amount: "250", period: "monthly" });

  async function budgetsOf(userId: string) {
    return getDb().select().from(budgets).where(eq(budgets.userId, userId));
  }
  async function createdId(input: object) {
    const before = new Set((await budgetsOf(alice.id)).map((row) => row.id));
    expect(await createBudget(input)).toEqual({ ok: true });
    // Rows come back in no particular order, so find the new one by its id.
    return (await budgetsOf(alice.id)).find((row) => !before.has(row.id))!.id;
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    groceries = await categoryIdByName(alice.id, "Groceries");
    rent = await categoryIdByName(alice.id, "Rent");
    salary = await categoryIdByName(alice.id, "Salary");
    bobGroceries = await categoryIdByName(bob.id, "Groceries");
  });
  beforeEach(async () => {
    await signInAs(alice.id);
    vi.mocked(revalidatePath).mockClear();
    await getDb().delete(budgets).where(eq(budgets.userId, alice.id));
  });
  afterAll(users.cleanup);

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(createBudget(valid()))).toBe("/login");
    expect(await redirectTarget(updateBudget(missing, valid()))).toBe("/login");
    expect(await redirectTarget(deleteBudget(missing))).toBe("/login");
  });

  describe("create", () => {
    it("creates a budget for the current user with a normalized amount", async () => {
      expect(await createBudget(valid())).toEqual({ ok: true });
      expect(await budgetsOf(alice.id)).toMatchObject([
        { userId: alice.id, categoryId: groceries, amount: "250.00", period: "monthly" },
      ]);
      expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining(["/budgets", "/dashboard"]));
    });

    it("allows the same category with both periods", async () => {
      await createdId({ ...valid(), period: "monthly" });
      await createdId({ ...valid(), period: "weekly" });
      expect((await budgetsOf(alice.id)).map((b) => b.period).sort()).toEqual(["monthly", "weekly"]);
    });

    it("refuses a second budget for the same category and period, with a clear message", async () => {
      await createdId(valid());
      expect(await createBudget({ ...valid(), amount: "999" })).toEqual({
        ok: false,
        error: "A monthly budget for this category already exists",
        fieldErrors: { categoryId: ["A monthly budget for this category already exists"] },
      });
      expect(await createBudget({ ...valid(), period: "weekly" })).toEqual({ ok: true });
      expect(await createBudget({ ...valid(), period: "weekly" })).toMatchObject({
        error: "A weekly budget for this category already exists",
      });
      expect(await budgetsOf(alice.id)).toHaveLength(2);
    });

    it("validates input and writes nothing", async () => {
      const result = await createBudget({ categoryId: "", amount: "0", period: "daily" });
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { categoryId: expect.any(Array), amount: expect.any(Array), period: expect.any(Array) },
      });
      expect(await budgetsOf(alice.id)).toHaveLength(0);
    });

    it("only accepts expense categories", async () => {
      expect(await createBudget({ ...valid(), categoryId: salary })).toEqual({
        ok: false,
        error: "Budgets work with expense categories only",
        fieldErrors: { categoryId: ["Budgets work with expense categories only"] },
      });
      expect(await budgetsOf(alice.id)).toHaveLength(0);
    });

    it("the database refuses an income category even if the app check were bypassed", async () => {
      await expect(getDb().insert(budgets).values({ userId: alice.id, categoryId: salary, amount: "10.00" })).rejects.toThrow();
    });

    it("rejects another user's category and unknown categories (tampered ids)", async () => {
      expect(await createBudget({ ...valid(), categoryId: bobGroceries })).toMatchObject({
        ok: false,
        fieldErrors: { categoryId: ["Choose one of your categories"] },
      });
      expect(await createBudget({ ...valid(), categoryId: missing })).toMatchObject({ ok: false });
      expect(await budgetsOf(alice.id)).toHaveLength(0);
      expect(await budgetsOf(bob.id)).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("changes category, amount and period", async () => {
      const id = await createdId(valid());
      expect(await updateBudget(id, { categoryId: rent, amount: "1200.5", period: "weekly" })).toEqual({ ok: true });
      expect((await budgetsOf(alice.id))[0]).toMatchObject({ id, categoryId: rent, amount: "1200.50", period: "weekly" });
    });

    it("can save a budget unchanged (no false duplicate)", async () => {
      const id = await createdId(valid());
      expect(await updateBudget(id, valid())).toEqual({ ok: true });
    });

    it("refuses a change that would duplicate another budget", async () => {
      await createdId({ ...valid(), categoryId: rent });
      const id = await createdId(valid());
      expect(await updateBudget(id, { ...valid(), categoryId: rent })).toMatchObject({
        ok: false,
        fieldErrors: { categoryId: ["A monthly budget for this category already exists"] },
      });
      expect((await budgetsOf(alice.id)).find((b) => b.id === id)!.categoryId).toBe(groceries);
    });

    it("validates input and the category like create does", async () => {
      const id = await createdId(valid());
      expect(await updateBudget(id, { ...valid(), amount: "-1" })).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(Array) } });
      expect(await updateBudget(id, { ...valid(), categoryId: salary })).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.any(Array) } });
      expect(await updateBudget(id, { ...valid(), categoryId: bobGroceries })).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.any(Array) } });
      expect((await budgetsOf(alice.id))[0].amount).toBe("250.00");
    });

    it("cannot update another user's budget (tampered id)", async () => {
      await signInAs(bob.id);
      expect(await createBudget({ categoryId: bobGroceries, amount: "70", period: "monthly" })).toEqual({ ok: true });
      const [bobsBudget] = await budgetsOf(bob.id);
      await signInAs(alice.id);
      expect(await updateBudget(bobsBudget.id, valid())).toEqual({ ok: false, error: "This item no longer exists." });
      expect((await budgetsOf(bob.id))[0]).toMatchObject({ amount: "70.00", categoryId: bobGroceries });
    });

    it("treats malformed and unknown ids as not found", async () => {
      expect(await updateBudget("nope", valid())).toMatchObject({ ok: false });
      expect(await updateBudget(undefined, valid())).toMatchObject({ ok: false });
      expect(await updateBudget(missing, valid())).toMatchObject({ ok: false, error: "This item no longer exists." });
    });
  });

  describe("delete", () => {
    it("deletes a budget", async () => {
      const id = await createdId(valid());
      expect(await deleteBudget(id)).toEqual({ ok: true });
      expect(await budgetsOf(alice.id)).toHaveLength(0);
    });

    it("cannot delete another user's budget (tampered id)", async () => {
      await signInAs(bob.id);
      await createBudget({ categoryId: bobGroceries, amount: "70", period: "monthly" });
      const [bobsBudget] = await budgetsOf(bob.id);
      await signInAs(alice.id);
      expect(await deleteBudget(bobsBudget.id)).toEqual({ ok: false, error: "This item no longer exists." });
      expect(await budgetsOf(bob.id)).toHaveLength(1);
    });

    it("treats malformed and unknown ids as not found", async () => {
      expect(await deleteBudget("1 OR 1=1")).toMatchObject({ ok: false });
      expect(await deleteBudget(undefined)).toMatchObject({ ok: false });
      expect(await deleteBudget(missing)).toMatchObject({ ok: false });
    });

    it("deleting a category also deletes its budgets", async () => {
      await createdId(valid());
      expect(await deleteCategory(groceries)).toEqual({ ok: true });
      expect(await budgetsOf(alice.id)).toHaveLength(0);
      expect(await getDb().select().from(categories).where(and(eq(categories.id, groceries)))).toHaveLength(0);
    });
  });
});
