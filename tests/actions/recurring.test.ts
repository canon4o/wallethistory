import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { postgresErrorCode } from "@/db/errors";
import { accounts, householdMembers, households, recurringRuleTags, recurringRules, tags, transactions, transfers } from "@/db/schema";
import {
  createRecurringRule,
  deleteRecurringRule,
  setRecurringRuleStatus,
  updateRecurringRule,
} from "@/lib/actions/recurring";
import { listRecurringRules } from "@/lib/data/recurring";
import { listTransactions } from "@/lib/data/transactions";
import { addDays } from "@/lib/recurring/dates";
import { todayISO } from "@/lib/budget-period";
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
const today = todayISO();

describe.skipIf(!TEST_DATABASE_URL)("recurring rule actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };
  let cash: string;
  let bank: string;
  let bobCash: string;
  let groceries: string;
  let salary: string;
  let tagId: string;
  let bobTag: string;
  let householdId: string;

  const expense = (extra: Record<string, unknown> = {}) => ({
    kind: "expense",
    amount: "20",
    accountId: cash,
    categoryId: groceries,
    note: "weekly shop",
    frequency: "weekly",
    intervalCount: 1,
    startDate: addDays(today, 30),
    ...extra,
  });
  const myRules = async () => getDb().select().from(recurringRules).where(eq(recurringRules.userId, alice.id));
  const aliceTransactions = () =>
    getDb().select().from(transactions).where(eq(transactions.userId, alice.id)).orderBy(asc(transactions.date));

  beforeAll(async () => {
    alice = await users.create({ label: "alice", name: "Alice" });
    bob = await users.create({ label: "bob", name: "Bob" });
    cash = await defaultAccountId(alice.id);
    [{ id: bank }] = await getDb()
      .insert(accounts)
      .values({ userId: alice.id, name: "Bank", type: "bank", color: "#337ab7", icon: "landmark", initialBalance: "0.00" })
      .returning({ id: accounts.id });
    bobCash = await defaultAccountId(bob.id);
    groceries = await categoryIdByName(alice.id, "Groceries");
    salary = await categoryIdByName(alice.id, "Salary");
    [{ id: tagId }] = await getDb().insert(tags).values({ userId: alice.id, name: "weekly" }).returning({ id: tags.id });
    [{ id: bobTag }] = await getDb().insert(tags).values({ userId: bob.id, name: "bob" }).returning({ id: tags.id });
  });
  beforeEach(async () => {
    await signInAs(alice.id);
    vi.mocked(revalidatePath).mockClear();
  });
  // Scoped to this file's users: other test files run in parallel against the same database.
  afterEach(async () => {
    const ids = [alice.id, bob.id];
    await getDb().delete(recurringRules).where(inArray(recurringRules.userId, ids));
    await getDb().delete(transactions).where(inArray(transactions.userId, ids));
    await getDb().delete(transfers).where(inArray(transfers.userId, ids));
  });
  afterAll(async () => {
    if (householdId) await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(createRecurringRule(expense()))).toBe("/login");
    expect(await redirectTarget(updateRecurringRule(missing, expense()))).toBe("/login");
    expect(await redirectTarget(setRecurringRuleStatus(missing, "paused"))).toBe("/login");
    expect(await redirectTarget(deleteRecurringRule(missing))).toBe("/login");
    expect(await redirectTarget(listRecurringRules())).toBe("/login");
  });

  it("creates a rule with tags that starts in the future", async () => {
    expect(await createRecurringRule(expense({ tagIds: [tagId] }))).toEqual({ ok: true });
    const [rule] = await myRules();
    expect(rule).toMatchObject({ kind: "expense", amount: "20.00", status: "active", nextDueDate: addDays(today, 30), pausedReason: null });
    expect(await aliceTransactions()).toHaveLength(0);
    expect((await listRecurringRules())[0]).toMatchObject({ accountName: "Cash", categoryName: "Groceries", tagIds: [tagId] });
    expect(revalidatePath).toHaveBeenCalledWith("/profile/recurring");
  });

  it("creates the entries that are already due right away", async () => {
    await createRecurringRule(expense({ frequency: "daily", startDate: addDays(today, -2) }));
    expect((await aliceTransactions()).map((t) => t.date)).toEqual([addDays(today, -2), addDays(today, -1), today]);
    expect((await myRules())[0].nextDueDate).toBe(addDays(today, 1));
  });

  it("marks the entries a rule created in the transaction history", async () => {
    await createRecurringRule(expense({ startDate: today }));
    await getDb().insert(transactions).values({ userId: alice.id, type: "expense", amount: "1.00", date: today, accountId: cash });
    await createRecurringRule({ kind: "transfer", amount: "5", fromAccountId: cash, toAccountId: bank, note: null, frequency: "daily", intervalCount: 1, startDate: today });
    const { items } = await listTransactions({ page: 1 });
    expect(items.map((item) => [item.type, item.recurring]).sort()).toEqual([
      ["expense", false],
      ["expense", true],
      ["transfer", true],
    ]);
  });

  it("creates income and transfer rules", async () => {
    await createRecurringRule(expense({ kind: "income", categoryId: salary, frequency: "monthly", startDate: addDays(today, 5) }));
    await createRecurringRule({
      kind: "transfer",
      amount: "50",
      fromAccountId: cash,
      toAccountId: bank,
      note: null,
      frequency: "daily",
      intervalCount: 2,
      startDate: today,
    });
    const rules = await listRecurringRules();
    expect(rules.map((r) => r.kind).sort()).toEqual(["income", "transfer"]);
    expect(rules.find((r) => r.kind === "transfer")).toMatchObject({ fromAccountName: "Cash", toAccountName: "Bank", accountId: null });
    expect(await getDb().select().from(transfers).where(eq(transfers.userId, alice.id))).toHaveLength(1);
  });

  it("rejects invalid input with field errors", async () => {
    expect(await createRecurringRule(expense({ intervalCount: 0 }))).toMatchObject({
      ok: false,
      fieldErrors: { intervalCount: [expect.any(String)] },
    });
    expect(await myRules()).toHaveLength(0);
  });

  it("rejects accounts, categories and tags that are not the user's own", async () => {
    expect(await createRecurringRule(expense({ accountId: bobCash }))).toMatchObject({ fieldErrors: { accountId: [expect.any(String)] } });
    expect(await createRecurringRule(expense({ categoryId: missing }))).toMatchObject({ fieldErrors: { categoryId: [expect.any(String)] } });
    expect(await createRecurringRule(expense({ categoryId: salary }))).toMatchObject({ fieldErrors: { categoryId: [expect.any(String)] } });
    expect(await createRecurringRule(expense({ tagIds: [bobTag] }))).toMatchObject({ fieldErrors: { tagIds: [expect.any(String)] } });
    const transfer = { kind: "transfer", amount: "5", note: null, frequency: "daily", intervalCount: 1, startDate: today };
    expect(await createRecurringRule({ ...transfer, fromAccountId: bobCash, toAccountId: cash })).toMatchObject({
      fieldErrors: { fromAccountId: [expect.any(String)] },
    });
    expect(await createRecurringRule({ ...transfer, fromAccountId: cash, toAccountId: bobCash })).toMatchObject({
      fieldErrors: { toAccountId: [expect.any(String)] },
    });
    expect(await myRules()).toHaveLength(0);
  });

  it("allows a transfer to a household member's account", async () => {
    const [household] = await getDb().insert(households).values({}).returning({ id: households.id });
    householdId = household.id;
    await getDb().insert(householdMembers).values([
      { householdId, userId: alice.id },
      { householdId, userId: bob.id },
    ]);
    const result = await createRecurringRule({
      kind: "transfer",
      amount: "5",
      fromAccountId: cash,
      toAccountId: bobCash,
      note: null,
      frequency: "monthly",
      intervalCount: 1,
      startDate: addDays(today, 3),
    });
    expect(result).toEqual({ ok: true });
    await getDb().delete(households).where(eq(households.id, householdId));
    householdId = "";
  });

  it("changing the schedule only affects entries from today on", async () => {
    await createRecurringRule(expense({ frequency: "daily", startDate: addDays(today, -2) }));
    const [rule] = await myRules();
    expect(await aliceTransactions()).toHaveLength(3);

    expect(await updateRecurringRule(rule.id, expense({ frequency: "weekly", startDate: addDays(today, -2), amount: "30", tagIds: [tagId] }))).toEqual({ ok: true });
    const [after] = await myRules();
    // Weekly from day -2: the next occurrence on or after today is day +5.
    expect(after).toMatchObject({ frequency: "weekly", amount: "30.00", nextDueDate: addDays(today, 5), status: "active" });
    const past = await aliceTransactions();
    expect(past).toHaveLength(3);
    expect(past.every((t) => t.amount === "20.00")).toBe(true);
    expect((await listRecurringRules())[0].tagIds).toEqual([tagId]);

    // Removing the tags clears them.
    await updateRecurringRule(rule.id, expense({ frequency: "weekly", startDate: addDays(today, -2) }));
    expect(await getDb().select().from(recurringRuleTags).where(eq(recurringRuleTags.ruleId, rule.id))).toHaveLength(0);
  });

  it("keeps the next date when only the details change, and can switch the kind", async () => {
    await createRecurringRule(expense());
    const [rule] = await myRules();
    expect(await updateRecurringRule(rule.id, expense({ kind: "transfer", accountId: null, categoryId: null, fromAccountId: cash, toAccountId: bank, note: "x" }))).toEqual({ ok: true });
    expect((await myRules())[0]).toMatchObject({ kind: "transfer", accountId: null, fromAccountId: cash, nextDueDate: addDays(today, 30) });
  });

  it("ends a rule whose end date is before its next date, and reopens it with a later one", async () => {
    await createRecurringRule(expense({ frequency: "daily", startDate: addDays(today, -1) }));
    const [rule] = await myRules();
    expect((await myRules())[0].nextDueDate).toBe(addDays(today, 1));

    await updateRecurringRule(rule.id, expense({ frequency: "daily", startDate: addDays(today, -1), endDate: today }));
    expect((await myRules())[0].status).toBe("ended");
    await updateRecurringRule(rule.id, expense({ frequency: "daily", startDate: addDays(today, -1), endDate: addDays(today, 10) }));
    expect((await myRules())[0].status).toBe("active");
  });

  it("keeps a paused rule paused when it is edited", async () => {
    await createRecurringRule(expense());
    const [rule] = await myRules();
    await setRecurringRuleStatus(rule.id, "paused");
    await updateRecurringRule(rule.id, expense({ amount: "99" }));
    expect((await myRules())[0]).toMatchObject({ status: "paused", pausedReason: "manual", amount: "99.00" });
  });

  it("does not touch other users' rules", async () => {
    await signInAs(bob.id);
    await createRecurringRule({ ...expense({ accountId: bobCash, categoryId: null }) });
    const [bobRule] = await getDb().select().from(recurringRules).where(eq(recurringRules.userId, bob.id));
    await signInAs(alice.id);
    expect(await updateRecurringRule(bobRule.id, expense())).toMatchObject({ ok: false });
    expect(await setRecurringRuleStatus(bobRule.id, "paused")).toMatchObject({ ok: false });
    expect(await deleteRecurringRule(bobRule.id)).toMatchObject({ ok: false });
    expect((await listRecurringRules())).toHaveLength(0);
    expect((await getDb().select().from(recurringRules).where(eq(recurringRules.id, bobRule.id)))[0].status).toBe("active");
  });

  it("rejects bad ids and unknown rules", async () => {
    expect(await updateRecurringRule("nope", expense())).toMatchObject({ ok: false });
    expect(await updateRecurringRule(missing, expense({ intervalCount: 0 }))).toMatchObject({ ok: false, fieldErrors: expect.any(Object) });
    expect(await updateRecurringRule(missing, expense())).toMatchObject({ ok: false });
    expect(await setRecurringRuleStatus("nope", "paused")).toMatchObject({ ok: false });
    expect(await setRecurringRuleStatus(missing, "paused")).toMatchObject({ ok: false });
    expect(await setRecurringRuleStatus(missing, "ended")).toMatchObject({ ok: false });
    expect(await deleteRecurringRule("nope")).toMatchObject({ ok: false });
    expect(await deleteRecurringRule(missing)).toMatchObject({ ok: false });
  });

  it("pauses and resumes without backfilling the paused period", async () => {
    await createRecurringRule(expense({ frequency: "daily", startDate: today }));
    const [rule] = await myRules();
    expect(await setRecurringRuleStatus(rule.id, "paused")).toEqual({ ok: true });
    expect((await myRules())[0]).toMatchObject({ status: "paused", pausedReason: "manual" });
    expect(await setRecurringRuleStatus(rule.id, "paused")).toEqual({ ok: true });

    // Pretend it was paused for a week.
    await getDb().update(recurringRules).set({ nextDueDate: addDays(today, -7) }).where(eq(recurringRules.id, rule.id));
    expect(await setRecurringRuleStatus(rule.id, "active")).toEqual({ ok: true });
    expect((await myRules())[0]).toMatchObject({ status: "active", pausedReason: null, nextDueDate: addDays(today, 1) });
    expect(await aliceTransactions()).toHaveLength(1);
  });

  it("resumes a stale rule from today and ends one whose end date has passed", async () => {
    await createRecurringRule(expense({ frequency: "daily", startDate: today }));
    const [rule] = await myRules();
    await getDb()
      .update(recurringRules)
      .set({ status: "paused", pausedReason: "stale", startDate: addDays(today, -900), endDate: addDays(today, -1), nextDueDate: addDays(today, -900) })
      .where(eq(recurringRules.id, rule.id));
    expect(await setRecurringRuleStatus(rule.id, "active")).toEqual({ ok: true });
    expect((await myRules())[0].status).toBe("ended");
    expect(await setRecurringRuleStatus(rule.id, "active")).toMatchObject({ ok: false, error: expect.stringContaining("ended") });
  });

  it("deletes the rule and keeps what it created", async () => {
    await createRecurringRule(expense({ frequency: "daily", startDate: addDays(today, -1) }));
    const [rule] = await myRules();
    expect(await deleteRecurringRule(rule.id)).toEqual({ ok: true });
    expect(await myRules()).toHaveLength(0);
    const kept = await aliceTransactions();
    expect(kept).toHaveLength(2);
    expect(kept.every((t) => t.recurringRuleId === null)).toBe(true);
  });

  it("is blocked by the database from pointing at foreign data", async () => {
    const insert = (values: Partial<typeof recurringRules.$inferInsert>) =>
      getDb()
        .insert(recurringRules)
        .values({ userId: alice.id, kind: "expense", amount: "1", accountId: cash, frequency: "daily", startDate: today, nextDueDate: today, ...values });
    for (const values of [
      { accountId: bobCash },
      { categoryId: salary },
      { kind: "transfer" as const, accountId: null, fromAccountId: bobCash, toAccountId: cash },
      { kind: "transfer" as const, accountId: null, fromAccountId: cash, toAccountId: bobCash },
    ]) {
      const error = await insert(values).then(() => null, (e: unknown) => e);
      expect(postgresErrorCode(error)).toBe("23514");
    }
    const noShape = await insert({ accountId: null }).then(() => null, (e: unknown) => e);
    expect(postgresErrorCode(noShape)).toBe("23514");

    await createRecurringRule(expense());
    const [rule] = await myRules();
    const tagError = await getDb().insert(recurringRuleTags).values({ ruleId: rule.id, tagId: bobTag }).then(() => null, (e: unknown) => e);
    expect(postgresErrorCode(tagError)).toBe("23514");
  });
});
