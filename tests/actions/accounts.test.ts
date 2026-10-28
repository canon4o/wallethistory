import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { createAccount, deleteAccount, updateAccount } from "@/lib/actions/accounts";
import { listAccounts } from "@/lib/data/accounts";
import { defaultAccountId, insertTransaction } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const valid = { name: "Travel card", type: "card", color: "#ea9150", icon: "credit-card", initialBalance: "250" };

describe.skipIf(!TEST_DATABASE_URL)("account actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
  });
  afterAll(users.cleanup);

  async function rowsOf(userId: string) {
    return getDb().select().from(accounts).where(eq(accounts.userId, userId));
  }

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(createAccount(valid))).toBe("/login");
    expect(await redirectTarget(updateAccount("6f1c2d6e-7b0a-4a52-9d6e-0f7a3c1b2d4e", valid))).toBe("/login");
    expect(await redirectTarget(deleteAccount("6f1c2d6e-7b0a-4a52-9d6e-0f7a3c1b2d4e"))).toBe("/login");
  });

  it("creates an account for the current user with a normalized balance", async () => {
    await signInAs(alice.id);
    expect(await createAccount(valid)).toEqual({ ok: true });
    const created = (await rowsOf(alice.id)).find((a) => a.name === "Travel card");
    expect(created).toMatchObject({ type: "card", initialBalance: "250.00", userId: alice.id });
  });

  it("returns field errors for invalid input and writes nothing", async () => {
    await signInAs(alice.id);
    const before = (await rowsOf(alice.id)).length;
    const result = await createAccount({ name: "", type: "nope", initialBalance: "-1" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { name: expect.any(Array), type: expect.any(Array), initialBalance: expect.any(Array) } });
    expect((await rowsOf(alice.id)).length).toBe(before);
  });

  it("updates an account", async () => {
    await signInAs(alice.id);
    const target = (await rowsOf(alice.id)).find((a) => a.name === "Travel card")!;
    expect(await updateAccount(target.id, { name: "Holiday card", type: "bank", color: "#337ab7", icon: "landmark", initialBalance: "10.5" })).toEqual({ ok: true });
    const [after] = await getDb().select().from(accounts).where(eq(accounts.id, target.id));
    expect(after).toMatchObject({ name: "Holiday card", type: "bank", initialBalance: "10.50" });
  });

  it("cannot update or delete another user's account, even with a valid id (tampered id)", async () => {
    await signInAs(alice.id);
    const bobsAccount = await defaultAccountId(bob.id);

    expect(await updateAccount(bobsAccount, { name: "Hacked", type: "cash", color: "#9cca56", icon: "banknote", initialBalance: "0" })).toMatchObject({
      ok: false,
      error: "This item no longer exists.",
    });
    expect(await deleteAccount(bobsAccount)).toMatchObject({ ok: false, error: "This item no longer exists." });

    const [untouched] = await getDb().select().from(accounts).where(eq(accounts.id, bobsAccount));
    expect(untouched.name).toBe("Cash");
    // The id also never shows up in Alice's list.
    expect((await listAccounts()).some((a) => a.id === bobsAccount)).toBe(false);
  });

  it("keeps a single default account per user", async () => {
    await signInAs(alice.id);
    expect(await createAccount({ ...valid, name: "Default one", isDefault: true })).toEqual({ ok: true });
    expect(await createAccount({ ...valid, name: "Default two", isDefault: true })).toEqual({ ok: true });
    let defaults = (await rowsOf(alice.id)).filter((a) => a.isDefault);
    expect(defaults.map((a) => a.name)).toEqual(["Default two"]);

    const one = (await rowsOf(alice.id)).find((a) => a.name === "Default one")!;
    expect(await updateAccount(one.id, { ...valid, name: "Default one", isDefault: true })).toEqual({ ok: true });
    defaults = (await rowsOf(alice.id)).filter((a) => a.isDefault);
    expect(defaults.map((a) => a.name)).toEqual(["Default one"]);
    expect((await listAccounts()).find((a) => a.id === one.id)?.isDefault).toBe(true);

    // Bob's default is independent of Alice's.
    await signInAs(bob.id);
    expect(await createAccount({ ...valid, name: "Bob default", isDefault: true })).toEqual({ ok: true });
    expect((await rowsOf(alice.id)).filter((a) => a.isDefault)).toHaveLength(1);

    // Unticking clears it; deleting a default leaves no default.
    await signInAs(alice.id);
    expect(await updateAccount(one.id, { ...valid, name: "Default one", isDefault: false })).toEqual({ ok: true });
    expect((await rowsOf(alice.id)).some((a) => a.isDefault)).toBe(false);
    const two = (await rowsOf(alice.id)).find((a) => a.name === "Default two")!;
    expect(await updateAccount(two.id, { ...valid, name: "Default two", isDefault: true })).toEqual({ ok: true });
    expect(await deleteAccount(two.id)).toEqual({ ok: true });
    expect((await rowsOf(alice.id)).some((a) => a.isDefault)).toBe(false);
    await getDb().delete(accounts).where(eq(accounts.id, one.id));
  });

  it("treats malformed ids as not found", async () => {
    await signInAs(alice.id);
    expect(await updateAccount("not-a-uuid", valid)).toMatchObject({ ok: false });
    expect(await deleteAccount("1 OR 1=1")).toMatchObject({ ok: false });
    expect(await deleteAccount(undefined)).toMatchObject({ ok: false });
  });

  it("reports an unknown id as not found", async () => {
    await signInAs(alice.id);
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await updateAccount(missing, valid)).toMatchObject({ ok: false, error: "This item no longer exists." });
    expect(await deleteAccount(missing)).toMatchObject({ ok: false, error: "This item no longer exists." });
  });

  it("blocks deleting an account that has transactions, with a clear message", async () => {
    await signInAs(alice.id);
    const cash = await defaultAccountId(alice.id);
    await insertTransaction({ userId: alice.id, accountId: cash, type: "expense", amount: "5.00" });
    const result = await deleteAccount(cash);
    expect(result).toEqual({
      ok: false,
      error: "This account has transactions. Delete or move them before deleting the account.",
    });
    expect((await rowsOf(alice.id)).some((a) => a.id === cash)).toBe(true);
  });

  it("deletes an unused account", async () => {
    await signInAs(alice.id);
    const target = (await rowsOf(alice.id)).find((a) => a.name === "Holiday card")!;
    expect(await deleteAccount(target.id)).toEqual({ ok: true });
    expect((await rowsOf(alice.id)).some((a) => a.id === target.id)).toBe(false);
  });
});
