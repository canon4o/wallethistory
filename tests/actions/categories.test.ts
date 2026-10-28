import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { postgresErrorCode } from "@/db/errors";
import { budgets, categories } from "@/db/schema";
import { createCategory, deleteCategory, updateCategory } from "@/lib/actions/categories";
import { categoryIdByName, defaultAccountId, insertTransaction } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const valid = { type: "expense", name: "Pets", color: "#8e6bbf", icon: "paw-print" };
const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("category actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
  });
  afterAll(users.cleanup);

  async function find(userId: string, type: "income" | "expense", name: string) {
    const [row] = await getDb()
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.type, type), eq(categories.name, name)));
    return row;
  }

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(createCategory(valid))).toBe("/login");
    expect(await redirectTarget(updateCategory(missing, valid))).toBe("/login");
    expect(await redirectTarget(deleteCategory(missing))).toBe("/login");
  });

  it("creates a category with a type, icon and color for the current user", async () => {
    await signInAs(alice.id);
    expect(await createCategory(valid)).toEqual({ ok: true });
    expect(await find(alice.id, "expense", "Pets")).toMatchObject({
      type: "expense",
      icon: "paw-print",
      color: "#8e6bbf",
      userId: alice.id,
    });
  });

  it("rejects invalid type, icon, color and name", async () => {
    await signInAs(alice.id);
    const result = await createCategory({ type: "transfer", name: "", color: "#000000", icon: "rocket" });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { type: expect.any(Array), name: expect.any(Array), color: expect.any(Array), icon: expect.any(Array) },
    });
  });

  it("refuses a duplicate name within the same type (any case) but allows it in the other type", async () => {
    await signInAs(alice.id);
    expect(await createCategory({ ...valid, name: "PETS" })).toMatchObject({
      ok: false,
      error: "A category with this name already exists for this type.",
      fieldErrors: { name: [expect.any(String)] },
    });
    expect(await createCategory({ ...valid, type: "income" })).toEqual({ ok: true });
    expect(await find(alice.id, "income", "Pets")).toBeDefined();
  });

  it("updates name, color and icon but never the type", async () => {
    await signInAs(alice.id);
    const pets = await find(alice.id, "expense", "Pets");
    expect(
      await updateCategory(pets.id, { name: "Animals", color: "#1aaaba", icon: "baby", type: "income" }),
    ).toEqual({ ok: true });
    const [after] = await getDb().select().from(categories).where(eq(categories.id, pets.id));
    expect(after).toMatchObject({ name: "Animals", color: "#1aaaba", icon: "baby", type: "expense" });
  });

  it("the database also refuses to change a category's type", async () => {
    const pets = await find(alice.id, "expense", "Animals");
    const error = await getDb()
      .update(categories)
      .set({ type: "income" })
      .where(eq(categories.id, pets.id))
      .then(() => null, (e: unknown) => e);
    // Drizzle wraps the driver error; the trigger's message and SQLSTATE are on its cause.
    expect(postgresErrorCode(error)).toBe("23514"); // check_violation
    expect((error as { cause: Error }).cause.message).toMatch(/cannot be changed/);
  });

  it("reports a rename that collides with an existing category", async () => {
    await signInAs(alice.id);
    const animals = await find(alice.id, "expense", "Animals");
    expect(await updateCategory(animals.id, { name: "Rent", color: "#1aaaba", icon: "home" })).toMatchObject({
      ok: false,
      fieldErrors: { name: [expect.any(String)] },
    });
  });

  it("cannot touch another user's category (tampered id)", async () => {
    await signInAs(alice.id);
    const bobsRent = await find(bob.id, "expense", "Rent");
    expect(await updateCategory(bobsRent.id, { name: "Hacked", color: "#1aaaba", icon: "tag" })).toMatchObject({
      ok: false,
      error: "This item no longer exists.",
    });
    expect(await deleteCategory(bobsRent.id)).toMatchObject({ ok: false, error: "This item no longer exists." });
    expect((await find(bob.id, "expense", "Rent")).name).toBe("Rent");
  });

  it("treats malformed or unknown ids as not found", async () => {
    await signInAs(alice.id);
    expect(await updateCategory("nope", valid)).toMatchObject({ ok: false });
    expect(await deleteCategory("nope")).toMatchObject({ ok: false });
    expect(await updateCategory(missing, { name: "X", color: "#1aaaba", icon: "tag" })).toMatchObject({ ok: false });
    expect(await deleteCategory(missing)).toMatchObject({ ok: false });
  });

  it("blocks deleting a category used by transactions, with a clear message", async () => {
    await signInAs(alice.id);
    const groceries = await categoryIdByName(alice.id, "Groceries");
    await insertTransaction({
      userId: alice.id,
      accountId: await defaultAccountId(alice.id),
      type: "expense",
      amount: "12.00",
      categoryId: groceries,
    });
    expect(await deleteCategory(groceries)).toEqual({
      ok: false,
      error: "This category is used by transactions. Delete or recategorize them before deleting the category.",
    });
  });

  it("deletes an unused category, together with its budgets", async () => {
    await signInAs(alice.id);
    const animals = await find(alice.id, "expense", "Animals");
    await getDb().insert(budgets).values({ userId: alice.id, categoryId: animals.id, amount: "50.00" });
    expect(await deleteCategory(animals.id)).toEqual({ ok: true });
    expect(await find(alice.id, "expense", "Animals")).toBeUndefined();
    expect(await getDb().select().from(budgets).where(eq(budgets.categoryId, animals.id))).toHaveLength(0);
  });
});
