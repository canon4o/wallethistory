import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { goalContributions, goals, householdMembers, households, recurringRules } from "@/db/schema";
import { createRecurringRule, updateRecurringRule } from "@/lib/actions/recurring";
import { listRecurringRules } from "@/lib/data/recurring";
import { materializeDueRules } from "@/lib/recurring/materialize";
import { defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const today = "2026-10-11";
const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("recurring deposits into goals", () => {
  const users = useTestUsers();
  let ann: { id: string };
  let ben: { id: string };
  let cat: { id: string };
  let annCash: string;
  let benCash: string;
  let catCash: string;
  let householdId: string;

  async function addGoal(userId: string, extra: Partial<typeof goals.$inferInsert> = {}) {
    const [row] = await getDb()
      .insert(goals)
      .values({ userId, name: "Japan", icon: "plane", color: "#ffd100", targetAmount: "1000.00", ...extra })
      .returning();
    return row;
  }
  async function addRule(goalId: string, extra: Partial<typeof recurringRules.$inferInsert> = {}) {
    const startDate = extra.startDate ?? "2026-08-11";
    const [row] = await getDb()
      .insert(recurringRules)
      .values({
        userId: ann.id,
        kind: "goal",
        amount: "100.00",
        accountId: annCash,
        goalId,
        frequency: "monthly",
        startDate,
        nextDueDate: startDate,
        ...extra,
      })
      .returning();
    return row;
  }
  const ruleRow = async (id: string) => (await getDb().select().from(recurringRules).where(eq(recurringRules.id, id)))[0];
  const deposits = (goalId: string) =>
    getDb().select().from(goalContributions).where(eq(goalContributions.goalId, goalId)).orderBy(asc(goalContributions.date));

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
  const mine = () => [ann.id, ben.id, cat.id];
  afterEach(async () => {
    await getDb().delete(recurringRules).where(inArray(recurringRules.userId, mine()));
    await getDb().delete(goals).where(inArray(goals.userId, mine()));
  });
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  it("deposits every missed occurrence with its original date", async () => {
    const goal = await addGoal(ann.id);
    const rule = await addRule(goal.id, { note: "monthly" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 3 });
    const rows = await deposits(goal.id);
    expect(rows.map((r) => [r.date, r.type, r.amount, r.userId, r.accountId, r.note, r.recurringRuleId])).toEqual(
      ["2026-08-11", "2026-09-11", "2026-10-11"].map((date) => [date, "deposit", "100.00", ann.id, annCash, "monthly", rule.id]),
    );
    expect(await ruleRow(rule.id)).toMatchObject({ status: "active", nextDueDate: "2026-11-11" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
    expect(await deposits(goal.id)).toHaveLength(3);
  });

  it("ends the rule once the goal reaches its target", async () => {
    const goal = await addGoal(ann.id, { targetAmount: "250.00" });
    const rule = await addRule(goal.id);
    // 100 + 100 + 100 reaches 250 on the third deposit; nothing more is added afterwards.
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 3 });
    expect(await ruleRow(rule.id)).toMatchObject({ status: "ended" });

    const full = await addGoal(ann.id, { name: "Done", targetAmount: "50.00" });
    await getDb().insert(goalContributions).values({ goalId: full.id, userId: ann.id, accountId: annCash, type: "deposit", amount: "60.00", date: "2026-10-01" });
    const rule2 = await addRule(full.id);
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
    expect(await ruleRow(rule2.id)).toMatchObject({ status: "ended" });
  });

  it("stops at the rule's own end date", async () => {
    const goal = await addGoal(ann.id);
    const rule = await addRule(goal.id, { endDate: "2026-09-30" });
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 2 });
    expect(await ruleRow(rule.id)).toMatchObject({ status: "ended" });
  });

  it("pauses when the goal was archived or deleted", async () => {
    const archived = await addGoal(ann.id, { archivedAt: new Date() });
    const deleted = await addGoal(ann.id, { name: "Gone", deletedAt: new Date() });
    const a = await addRule(archived.id);
    const d = await addRule(deleted.id);
    expect(await materializeDueRules([ann.id], { today })).toEqual({ created: 0 });
    expect(await ruleRow(a.id)).toMatchObject({ status: "paused", pausedReason: "goal_closed" });
    expect(await ruleRow(d.id)).toMatchObject({ status: "paused", pausedReason: "goal_closed" });
  });

  it("pays into a household member's shared goal and pauses once it is no longer shared", async () => {
    const goal = await addGoal(ben.id, { shared: true });
    const rule = await addRule(goal.id, { startDate: "2026-10-11" });
    expect(await materializeDueRules([ann.id, ben.id], { today })).toEqual({ created: 1 });
    expect((await deposits(goal.id))[0]).toMatchObject({ userId: ann.id, accountId: annCash });

    await getDb().update(goals).set({ shared: false }).where(eq(goals.id, goal.id));
    await getDb().update(recurringRules).set({ nextDueDate: "2026-10-11" }).where(eq(recurringRules.id, rule.id));
    expect(await materializeDueRules([ann.id, ben.id], { today })).toEqual({ created: 0 });
    expect(await ruleRow(rule.id)).toMatchObject({ status: "paused", pausedReason: "household_link" });
  });

  it("lets a rule be created for my own or a shared goal only", async () => {
    const own = await addGoal(ann.id);
    const shared = await addGoal(ben.id, { name: "Shared", shared: true });
    const private_ = await addGoal(ben.id, { name: "Private" });
    const archived = await addGoal(ann.id, { name: "Old", archivedAt: new Date() });
    await signInAs(ann.id);
    const input = (goalId: string, extra: Record<string, unknown> = {}) => ({
      kind: "goal",
      amount: "25",
      accountId: annCash,
      goalId,
      note: "",
      frequency: "monthly",
      intervalCount: 1,
      startDate: "2099-01-01",
      endDate: "",
      ...extra,
    });
    expect(await createRecurringRule(input(own.id))).toEqual({ ok: true });
    expect(await createRecurringRule(input(shared.id))).toEqual({ ok: true });
    expect(await createRecurringRule(input(private_.id))).toMatchObject({ ok: false, fieldErrors: { goalId: expect.any(Array) } });
    expect(await createRecurringRule(input(missing))).toMatchObject({ ok: false, fieldErrors: { goalId: expect.any(Array) } });
    expect(await createRecurringRule(input(archived.id))).toMatchObject({ ok: false, fieldErrors: { goalId: ["This goal is archived"] } });
    expect(await createRecurringRule(input(own.id, { goalId: "" }))).toMatchObject({ ok: false, fieldErrors: { goalId: ["Choose a goal"] } });
    expect(await createRecurringRule(input(own.id, { accountId: benCash }))).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(Array) } });
    await signInAs(cat.id);
    expect(await createRecurringRule(input(shared.id, { accountId: catCash }))).toMatchObject({ ok: false, fieldErrors: { goalId: expect.any(Array) } });

    await signInAs(ann.id);
    const items = await listRecurringRules();
    expect(items.map((i) => [i.kind, i.goalName, i.accountName, i.categoryId]).sort()).toEqual([
      ["goal", "Japan", "Cash", null],
      ["goal", "Shared", "Cash", null],
    ]);
    const [rule] = items;
    expect(await updateRecurringRule(rule.id, input(own.id, { amount: "30" }))).toEqual({ ok: true });
    expect((await ruleRow(rule.id)).amount).toBe("30.00");
    // Switching a goal rule to an expense clears the goal.
    const salary = null;
    expect(await updateRecurringRule(rule.id, { ...input(own.id), kind: "expense", categoryId: salary })).toEqual({ ok: true });
    expect(await ruleRow(rule.id)).toMatchObject({ kind: "expense", goalId: null });
  });

  it("is removed with the goal when the goal is really deleted", async () => {
    const goal = await addGoal(ann.id);
    const rule = await addRule(goal.id, { startDate: "2099-01-01" });
    await getDb().delete(goals).where(eq(goals.id, goal.id));
    expect(await getDb().select().from(recurringRules).where(eq(recurringRules.id, rule.id))).toHaveLength(0);
  });
});
