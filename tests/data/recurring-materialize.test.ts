import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  householdMembers,
  households,
  recurringRuleTags,
  recurringRules,
  tags,
  transactionTags,
  transactions,
  transfers,
} from "@/db/schema";
import { materializeDueRules, materializeForUser } from "@/lib/recurring/materialize";
import { listAccounts } from "@/lib/data/accounts";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const today = "2026-10-11";

describe.skipIf(!TEST_DATABASE_URL)("recurring catch-up", () => {
  const users = useTestUsers();
  let ann: { id: string };
  let ben: { id: string };
  let outsider: { id: string };
  let annCash: string;
  let benCash: string;
  let outsiderCash: string;
  let householdId: string;

  type Rule = Partial<typeof recurringRules.$inferInsert>;
  async function addRule(rule: Rule = {}) {
    const startDate = rule.startDate ?? "2026-08-11";
    const [row] = await getDb()
      .insert(recurringRules)
      .values({
        userId: ann.id,
        kind: "expense",
        amount: "10.00",
        accountId: annCash,
        frequency: "monthly",
        intervalCount: 1,
        startDate,
        nextDueDate: startDate,
        ...rule,
      })
      .returning();
    return row;
  }
  const ruleRow = async (id: string) => (await getDb().select().from(recurringRules).where(eq(recurringRules.id, id)))[0];
  const annTransactions = () =>
    getDb().select().from(transactions).where(eq(transactions.userId, ann.id)).orderBy(asc(transactions.date));

  beforeAll(async () => {
    ann = await users.create({ label: "ann", name: "Ann" });
    ben = await users.create({ label: "ben", name: "Ben" });
    outsider = await users.create({ label: "out", name: "Out" });
    [annCash, benCash, outsiderCash] = await Promise.all([ann, ben, outsider].map((u) => defaultAccountId(u.id)));
    const [household] = await getDb().insert(households).values({}).returning({ id: households.id });
    householdId = household.id;
    await getDb().insert(householdMembers).values([
      { householdId, userId: ann.id },
      { householdId, userId: ben.id },
    ]);
  });
  // Scoped to this file's users: other test files run in parallel against the same database.
  const mine = () => [ann.id, ben.id, outsider.id];
  afterEach(async () => {
    await getDb().delete(recurringRules).where(inArray(recurringRules.userId, mine()));
    await getDb().delete(transactions).where(inArray(transactions.userId, mine()));
    await getDb().delete(transfers).where(inArray(transfers.userId, mine()));
  });
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  it("creates every missed occurrence with its original date and advances the rule", async () => {
    const rule = await addRule();
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 3 });

    const rows = await annTransactions();
    expect(rows.map((r) => r.date)).toEqual(["2026-08-11", "2026-09-11", "2026-10-11"]);
    expect(rows[0]).toMatchObject({ type: "expense", amount: "10.00", accountId: annCash, recurringRuleId: rule.id, recurringDate: "2026-08-11" });
    expect(await ruleRow(rule.id)).toMatchObject({ status: "active", nextDueDate: "2026-11-11" });
  });

  it("is idempotent: running it again creates nothing", async () => {
    await addRule();
    await materializeDueRules([ann.id], { today });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
    expect(await annTransactions()).toHaveLength(3);
  });

  it("does not duplicate entries when two requests run at once", async () => {
    await addRule({ frequency: "daily", startDate: "2026-09-01", nextDueDate: "2026-09-01" });
    await Promise.all([materializeDueRules([ann.id], { today }), materializeDueRules([ann.id], { today })]);
    expect(await annTransactions()).toHaveLength(41);
  });

  it("does not recreate an entry that the user deleted", async () => {
    const rule = await addRule();
    await materializeDueRules([ann.id], { today });
    await getDb().delete(transactions).where(eq(transactions.recurringDate, "2026-09-11"));
    // Simulate a lost update of the rule: the unique key still blocks the duplicate.
    await getDb().update(recurringRules).set({ nextDueDate: "2026-09-11" }).where(eq(recurringRules.id, rule.id));
    await materializeDueRules([ann.id], { today });
    expect((await annTransactions()).map((r) => r.date)).toEqual(["2026-08-11", "2026-09-11", "2026-10-11"]);
  });

  it("copies category, note and tags, and creates income entries", async () => {
    const salary = await categoryIdByName(ann.id, "Salary");
    const [tag] = await getDb().insert(tags).values({ userId: ann.id, name: "monthly" }).returning({ id: tags.id });
    const rule = await addRule({ kind: "income", categoryId: salary, note: "pay", amount: "2000.00", startDate: "2026-09-30", nextDueDate: "2026-09-30" });
    await getDb().insert(recurringRuleTags).values({ ruleId: rule.id, tagId: tag.id });

    await materializeDueRules([ann.id], { today });
    const rows = await annTransactions();
    expect(rows.map((r) => [r.type, r.date, r.categoryId, r.note])).toEqual([["income", "2026-09-30", salary, "pay"]]);
    const tagged = await getDb().select().from(transactionTags).where(eq(transactionTags.tagId, tag.id));
    expect(tagged).toEqual([{ transactionId: rows[0].id, tagId: tag.id }]);
    expect(await ruleRow(rule.id)).toMatchObject({ nextDueDate: "2026-10-30" });
    await getDb().delete(tags).where(eq(tags.id, tag.id));
  });

  it("creates nothing before the first occurrence", async () => {
    const rule = await addRule({ startDate: "2026-10-12", nextDueDate: "2026-10-12" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
    expect(await ruleRow(rule.id)).toMatchObject({ nextDueDate: "2026-10-12", status: "active" });
  });

  it("stops at the end date and marks the rule ended", async () => {
    const rule = await addRule({ endDate: "2026-09-20" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 2 });
    expect(await ruleRow(rule.id)).toMatchObject({ status: "ended", nextDueDate: "2026-10-11" });
    expect(await materializeDueRules([ann.id], { today: "2027-01-01" })).toEqual({ created: 0 });
  });

  it("keeps a rule active when the end date is still ahead", async () => {
    const rule = await addRule({ endDate: "2027-01-01" });
    await materializeDueRules([ann.id], { today });
    expect(await ruleRow(rule.id)).toMatchObject({ status: "active" });
  });

  it("pauses a rule more than two years behind instead of catching up", async () => {
    const rule = await addRule({ frequency: "weekly", startDate: "2024-01-01", nextDueDate: "2024-01-01" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
    expect(await ruleRow(rule.id)).toMatchObject({ status: "paused", pausedReason: "stale", nextDueDate: "2024-01-01" });
    expect(await annTransactions()).toHaveLength(0);
  });

  it("still catches up a rule that is just inside the two-year window", async () => {
    await addRule({ frequency: "yearly", startDate: "2024-10-11", nextDueDate: "2024-10-11" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 3 });
  });

  it("skips paused rules", async () => {
    await addRule({ status: "paused", pausedReason: "manual" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
  });

  it("creates transfers that move both balances", async () => {
    const [bank] = await getDb()
      .insert(accounts)
      .values({ userId: ann.id, name: "Bank", type: "bank", color: "#337ab7", icon: "landmark", initialBalance: "0.00" })
      .returning({ id: accounts.id });
    const rule = await addRule({
      kind: "transfer",
      accountId: null,
      fromAccountId: annCash,
      toAccountId: bank.id,
      amount: "5.00",
      note: "save",
      startDate: "2026-09-11",
      nextDueDate: "2026-09-11",
    });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 2 });
    const rows = await getDb().select().from(transfers).where(inArray(transfers.userId, mine())).orderBy(asc(transfers.date));
    expect(rows.map((r) => [r.date, r.amount, r.note, r.recurringRuleId])).toEqual([
      ["2026-09-11", "5.00", "save", rule.id],
      ["2026-10-11", "5.00", "save", rule.id],
    ]);
    await signInAs(ann.id);
    expect(Object.fromEntries((await listAccounts()).map((a) => [a.name, a.balance]))).toMatchObject({ Bank: "10.00" });
    await getDb().delete(recurringRules).where(inArray(recurringRules.userId, mine()));
    await getDb().delete(transfers).where(inArray(transfers.userId, mine()));
    await getDb().delete(accounts).where(eq(accounts.id, bank.id));
  });

  it("pauses a transfer rule whose destination left the household", async () => {
    const rule = await addRule({
      kind: "transfer",
      accountId: null,
      fromAccountId: annCash,
      toAccountId: outsiderCash,
      startDate: "2026-10-01",
      nextDueDate: "2026-10-01",
    }).catch((error: unknown) => error);
    // The database refuses a destination outside the household, so build the same state by
    // moving the destination owner out after the rule exists.
    expect(rule).toBeInstanceOf(Error);

    const valid = await addRule({
      kind: "transfer",
      accountId: null,
      fromAccountId: annCash,
      toAccountId: benCash,
      startDate: "2026-10-01",
      nextDueDate: "2026-10-01",
    });
    await getDb().delete(householdMembers).where(eq(householdMembers.userId, ben.id));
    try {
      // Ann alone (no household any more): Ben's account is no longer an allowed destination.
      expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
      expect(await ruleRow(valid.id)).toMatchObject({ status: "paused", pausedReason: "household_link" });
    } finally {
      await getDb().insert(householdMembers).values({ householdId, userId: ben.id });
    }
  });

  it("runs household members' rules too, under their own user id", async () => {
    await addRule({ userId: ben.id, accountId: benCash, startDate: "2026-10-01", nextDueDate: "2026-10-01" });
    await addRule({ userId: outsider.id, accountId: outsiderCash, startDate: "2026-10-01", nextDueDate: "2026-10-01" });
    await signInAs(ann.id);
    await materializeForUser({ id: ann.id, name: "Ann" });

    const rows = await getDb().select().from(transactions).where(inArray(transactions.userId, mine()));
    expect(rows.map((r) => r.userId)).toEqual([ben.id]);
  });

  it("keeps going when one rule fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = await addRule({ startDate: "2026-10-01", nextDueDate: "2026-10-01" });
    await addRule({ amount: "7.00", startDate: "2026-10-02", nextDueDate: "2026-10-02" });
    // Move the account to someone else after the fact: the integrity trigger rejects the insert.
    await getDb().execute(sql`alter table recurring_rules disable trigger recurring_rules_integrity`);
    await getDb().update(recurringRules).set({ accountId: outsiderCash }).where(eq(recurringRules.id, bad.id));
    await getDb().execute(sql`alter table recurring_rules enable trigger recurring_rules_integrity`);

    const result = await materializeDueRules([ann.id], { today });
    expect(result).toEqual({ created: 1 });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    expect(await ruleRow(bad.id)).toMatchObject({ nextDueDate: "2026-10-01" });
  });

  it("does not break the page when catch-up itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await materializeForUser({ id: "not-a-uuid", name: "Nobody" });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("keeps past entries when the rule is deleted", async () => {
    const rule = await addRule();
    await materializeDueRules([ann.id], { today });
    await getDb().delete(recurringRules).where(eq(recurringRules.id, rule.id));
    const rows = await annTransactions();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.recurringRuleId === null && r.recurringDate !== null)).toBe(true);
  });
});
