import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { postgresErrorCode } from "@/db/errors";
import { accounts, transfers } from "@/db/schema";
import { createTransfer, deleteTransfer, updateTransfer } from "@/lib/actions/transfers";
import { deleteAccount } from "@/lib/actions/accounts";
import { listAccounts } from "@/lib/data/accounts";
import { getDashboard } from "@/lib/data/dashboard";
import { defaultAccountId, insertTransaction } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("transfer actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let cash: string;
  let bank: string;
  let bobAccount: string;

  const valid = () => ({ fromAccountId: cash, toAccountId: bank, amount: "25", date: "2026-03-04", note: " move " });

  async function balances() {
    const list = await listAccounts();
    return Object.fromEntries(list.map((a) => [a.name, a.balance]));
  }
  async function allTransfers() {
    return getDb().select().from(transfers).where(eq(transfers.userId, alice.id));
  }

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    cash = await defaultAccountId(alice.id);
    [{ id: bank }] = await getDb()
      .insert(accounts)
      .values({ userId: alice.id, name: "Bank", type: "bank", color: "#337ab7", icon: "landmark", initialBalance: "100.00" })
      .returning({ id: accounts.id });
    bobAccount = await defaultAccountId(bob.id);
    await insertTransaction({ userId: alice.id, accountId: cash, type: "income", amount: "50.00" });
  });
  beforeEach(async () => {
    await signInAs(alice.id);
    vi.mocked(revalidatePath).mockClear();
  });
  afterAll(users.cleanup);

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(createTransfer(valid()))).toBe("/login");
    expect(await redirectTarget(updateTransfer(missing, valid()))).toBe("/login");
    expect(await redirectTarget(deleteTransfer(missing))).toBe("/login");
  });

  it("rejects invalid input with field errors", async () => {
    const result = await createTransfer({ ...valid(), toAccountId: cash });
    expect(result).toMatchObject({ ok: false, fieldErrors: { toAccountId: [expect.any(String)] } });
    expect(await allTransfers()).toHaveLength(0);
  });

  it("rejects accounts that belong to someone else", async () => {
    expect(await createTransfer({ ...valid(), toAccountId: bobAccount })).toMatchObject({
      ok: false,
      fieldErrors: { toAccountId: [expect.any(String)] },
    });
    expect(await createTransfer({ ...valid(), fromAccountId: bobAccount })).toMatchObject({
      ok: false,
      fieldErrors: { fromAccountId: [expect.any(String)] },
    });
    expect(await allTransfers()).toHaveLength(0);
  });

  it("moves money between accounts without touching income, expense or the total", async () => {
    const before = await getDashboard();
    expect(await balances()).toEqual({ Cash: "50.00", Bank: "100.00" });

    expect(await createTransfer(valid())).toEqual({ ok: true });
    expect(await balances()).toEqual({ Cash: "25.00", Bank: "125.00" });
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/profile/accounts");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");

    const after = await getDashboard();
    expect(after.totalBalance).toBe(before.totalBalance);
    expect([after.income, after.expense, after.net]).toEqual([before.income, before.expense, before.net]);

    const [row] = await allTransfers();
    expect(row).toMatchObject({ amount: "25.00", note: "move", userId: alice.id });
  });

  it("updates and deletes only the owner's transfers", async () => {
    const [{ id }] = await allTransfers();

    expect(await updateTransfer(id, { ...valid(), amount: "10", fromAccountId: bank, toAccountId: cash })).toEqual({ ok: true });
    expect(await balances()).toEqual({ Cash: "60.00", Bank: "90.00" });

    expect(await updateTransfer(missing, valid())).toMatchObject({ ok: false });
    expect(await updateTransfer("not-a-uuid", valid())).toMatchObject({ ok: false });
    expect(await updateTransfer(id, { ...valid(), toAccountId: bobAccount })).toMatchObject({ ok: false });

    await signInAs(bob.id);
    expect(await updateTransfer(id, { ...valid(), fromAccountId: bobAccount, toAccountId: bobAccount })).toMatchObject({ ok: false });
    expect(await deleteTransfer(id)).toMatchObject({ ok: false });
    expect(await deleteTransfer("not-a-uuid")).toMatchObject({ ok: false });

    await signInAs(alice.id);
    expect(await allTransfers()).toHaveLength(1);
    expect(await deleteTransfer(id)).toEqual({ ok: true });
    expect(await allTransfers()).toHaveLength(0);
    expect(await balances()).toEqual({ Cash: "50.00", Bank: "100.00" });
  });

  it("blocks deleting an account that has transfers", async () => {
    expect(await createTransfer(valid())).toEqual({ ok: true });
    expect(await deleteAccount(bank)).toMatchObject({ ok: false });
    const [{ id }] = await allTransfers();
    await deleteTransfer(id);
  });

  it("is enforced by the database too", async () => {
    const insert = (values: Partial<typeof transfers.$inferInsert>) =>
      getDb().insert(transfers).values({ userId: alice.id, fromAccountId: cash, toAccountId: bank, amount: "1", date: "2026-01-01", ...values });
    const codeOf = async (run: ReturnType<typeof insert>) => {
      try {
        await run;
      } catch (error) {
        return postgresErrorCode(error);
      }
    };
    // 23514 = check_violation (constraints and the ownership trigger).
    expect(await codeOf(insert({ toAccountId: cash }))).toBe("23514");
    expect(await codeOf(insert({ amount: "0" }))).toBe("23514");
    expect(await codeOf(insert({ toAccountId: bobAccount }))).toBe("23514");
  });
});
