import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { postgresErrorCode } from "@/db/errors";
import { householdMembers, households, transfers } from "@/db/schema";
import { createTransfer, deleteTransfer, updateTransfer } from "@/lib/actions/transfers";
import { listAccounts, listHouseholdAccounts } from "@/lib/data/accounts";
import { getDashboard } from "@/lib/data/dashboard";
import { listTransactions } from "@/lib/data/transactions";
import { defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const today = "2026-10-15";

describe.skipIf(!TEST_DATABASE_URL)("transfers between household members", () => {
  const users = useTestUsers();
  let ann: { id: string };
  let ben: { id: string };
  let cat: { id: string };
  let annCash: string;
  let benCash: string;
  let catCash: string;
  let householdId: string;

  const send = (amount = "25") => ({ fromAccountId: annCash, toAccountId: benCash, amount, date: "2026-10-10", note: "rent share" });
  const allTransfers = () => getDb().select().from(transfers);

  beforeAll(async () => {
    ann = await users.create({ label: "ann", name: "Ann" });
    ben = await users.create({ label: "ben", name: "Ben" });
    cat = await users.create({ label: "cat", name: "Cat" });
    [annCash, benCash, catCash] = await Promise.all([ann, ben, cat].map((u) => defaultAccountId(u.id)));
    const [household] = await getDb().insert(households).values({}).returning({ id: households.id });
    householdId = household.id;
    await getDb().insert(householdMembers).values([
      { householdId, userId: ann.id },
      { householdId, userId: ben.id },
    ]);
  });
  afterEach(() => getDb().delete(transfers));
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  it("sends money to a household member's account and moves both balances", async () => {
    await signInAs(ann.id);
    expect(await createTransfer(send())).toEqual({ ok: true });
    expect((await allTransfers())[0]).toMatchObject({ userId: ann.id, fromAccountId: annCash, toAccountId: benCash });
    expect((await listAccounts())[0].balance).toBe("-25.00");
    expect((await listHouseholdAccounts())[0]).toMatchObject({ ownerName: "Ben", balance: "25.00" });

    await signInAs(ben.id);
    expect((await listAccounts())[0].balance).toBe("25.00");
  });

  it("keeps the household total unchanged and moves the 'Mine' total", async () => {
    await signInAs(ann.id);
    await createTransfer(send());
    expect(await getDashboard(today)).toMatchObject({ scope: "household", totalBalance: "0.00", income: "0.00", expense: "0.00" });
    expect(await getDashboard(today, "mine")).toMatchObject({ scope: "mine", totalBalance: "-25.00" });
    await signInAs(ben.id);
    expect(await getDashboard(today, "mine")).toMatchObject({ totalBalance: "25.00" });
  });

  it("shows the transfer to both people, read-only for the receiver", async () => {
    await signInAs(ann.id);
    await createTransfer(send());
    const mine = (await listTransactions({ page: 1 })).items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      type: "transfer",
      owner: { name: "Ann", isMine: true },
      account: { ownerName: "Ann", isMine: true },
      transferTo: { ownerName: "Ben", isMine: false },
    });

    await signInAs(ben.id);
    const theirs = (await listTransactions({ page: 1, personId: ben.id })).items;
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ type: "transfer", owner: { name: "Ann", isMine: false }, transferTo: { id: benCash } });
    // Only the sender can change or delete it.
    expect(await deleteTransfer(theirs[0].id)).toMatchObject({ ok: false });
    expect(await updateTransfer(theirs[0].id, send("1"))).toMatchObject({ ok: false });
    expect(await allTransfers()).toHaveLength(1);
  });

  it("lets the sender edit the amount and delete it", async () => {
    await signInAs(ann.id);
    await createTransfer(send());
    const [row] = await allTransfers();
    expect(await updateTransfer(row.id, send("40"))).toEqual({ ok: true });
    expect((await listAccounts())[0].balance).toBe("-40.00");
    expect(await deleteTransfer(row.id)).toEqual({ ok: true });
    expect((await listAccounts())[0].balance).toBe("0.00");
  });

  it("refuses accounts of people outside the household and a foreign From account", async () => {
    await signInAs(ann.id);
    expect(await createTransfer({ ...send(), toAccountId: catCash })).toMatchObject({
      ok: false,
      fieldErrors: { toAccountId: expect.any(Array) },
    });
    expect(await createTransfer({ ...send(), fromAccountId: benCash, toAccountId: annCash })).toMatchObject({
      ok: false,
      fieldErrors: { fromAccountId: expect.any(Array) },
    });
    expect(await createTransfer({ ...send(), toAccountId: "00000000-0000-4000-8000-000000000000" })).toMatchObject({ ok: false });
    expect(await allTransfers()).toHaveLength(0);
  });

  it("is enforced by the database too", async () => {
    const insert = (toAccountId: string) =>
      getDb().insert(transfers).values({ userId: ann.id, fromAccountId: annCash, toAccountId, amount: "1.00", date: "2026-10-10" });
    await expect(insert(catCash)).rejects.toSatisfy((e) => postgresErrorCode(e) === "23514");
    await expect(
      getDb().insert(transfers).values({ userId: ann.id, fromAccountId: benCash, toAccountId: annCash, amount: "1.00", date: "2026-10-10" }),
    ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23514");
    await expect(insert(benCash)).resolves.toBeDefined();
  });

  it("keeps balances right after the link is removed, and labels the sender as a former member", async () => {
    await signInAs(ann.id);
    await createTransfer(send());
    await getDb().delete(householdMembers).where(eq(householdMembers.userId, ben.id));
    expect((await listAccounts())[0].balance).toBe("-25.00");
    await signInAs(ben.id);
    expect((await listAccounts())[0].balance).toBe("25.00");
    const [item] = (await listTransactions({ page: 1 })).items;
    expect(item.owner).toMatchObject({ name: "Former member", isMine: false });
    await getDb().insert(householdMembers).values({ householdId, userId: ben.id });
  });

  it("cannot be edited into a household the sender has left", async () => {
    await signInAs(ann.id);
    await createTransfer(send());
    const [row] = await allTransfers();
    await getDb().delete(householdMembers).where(eq(householdMembers.userId, ben.id));
    expect(await updateTransfer(row.id, send("2"))).toMatchObject({ ok: false, fieldErrors: { toAccountId: expect.any(Array) } });
    expect(await deleteTransfer(row.id)).toEqual({ ok: true });
    await getDb().insert(householdMembers).values({ householdId, userId: ben.id });
  });
});
