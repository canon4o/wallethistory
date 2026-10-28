import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { getPreferredAccountId } from "@/lib/data/accounts";
import { defaultAccountId, insertTransaction } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe.skipIf(!TEST_DATABASE_URL)("getPreferredAccountId", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let cash: string;
  let bank: string;
  let bobCash: string;

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
    cash = await defaultAccountId(alice.id);
    bobCash = await defaultAccountId(bob.id);
    const [created] = await getDb()
      .insert(accounts)
      .values({ userId: alice.id, name: "Bank", type: "bank", color: "#337ab7", icon: "landmark" })
      .returning({ id: accounts.id });
    bank = created.id;
  });
  afterAll(users.cleanup);

  it("falls back to the first account when there are no transactions", async () => {
    await signInAs(alice.id);
    expect(await getPreferredAccountId()).toBe(cash);
  });

  it("uses the account of the most recent transaction when it is the only evidence", async () => {
    await signInAs(alice.id);
    await insertTransaction({ userId: alice.id, accountId: cash, type: "expense", amount: "1.00", date: "2026-01-01" });
    await insertTransaction({ userId: alice.id, accountId: bank, type: "expense", amount: "1.00", date: "2026-02-01" });
    expect(await getPreferredAccountId()).toBe(bank);
  });

  it("uses the most used account among the last 5 transactions, a tie going to the more recent one", async () => {
    await signInAs(alice.id);
    // Already: cash on 2026-01-01, bank on 2026-02-01. Three more cash purchases make cash 4 of the last 5.
    for (const date of ["2026-02-02", "2026-02-03", "2026-02-04"]) {
      await insertTransaction({ userId: alice.id, accountId: cash, type: "expense", amount: "1.00", date });
    }
    await insertTransaction({ userId: alice.id, accountId: bank, type: "expense", amount: "1.00", date: "2026-02-05" });
    expect(await getPreferredAccountId()).toBe(cash);
    // Two more bank purchases push the last 5 to bank 3, cash 2 (older cash ones no longer count).
    await insertTransaction({ userId: alice.id, accountId: bank, type: "expense", amount: "1.00", date: "2026-02-06" });
    await insertTransaction({ userId: alice.id, accountId: bank, type: "expense", amount: "1.00", date: "2026-02-07" });
    expect(await getPreferredAccountId()).toBe(bank);
  });

  it("prefers the default account, then the viewed account, ignoring accounts that are not mine", async () => {
    await signInAs(alice.id);
    await getDb().update(accounts).set({ isDefault: true }).where(eq(accounts.id, cash));
    expect(await getPreferredAccountId()).toBe(cash);
    expect(await getPreferredAccountId(bank)).toBe(bank);
    expect(await getPreferredAccountId(bobCash)).toBe(cash);
  });
});
