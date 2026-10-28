import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, goalContributions, goals, householdMembers, households, recurringRules } from "@/db/schema";
import { addGoalContribution, deleteGoalContribution, updateGoalContribution } from "@/lib/actions/goal-contributions";
import { createGoal, deleteGoal, deleteGoalPermanently, restoreGoal, setGoalArchived, updateGoal } from "@/lib/actions/goals";
import { leaveHousehold, removeHouseholdMember } from "@/lib/actions/household";
import { defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const missing = "00000000-0000-4000-8000-000000000000";
const FUTURE = "2099-01-01";

const goalInput = (extra: Record<string, unknown> = {}) => ({
  name: "Travel to Japan",
  targetAmount: "1000",
  deadline: FUTURE,
  color: "#ffd100",
  icon: "plane",
  shared: false,
  note: "",
  ...extra,
});

describe.skipIf(!TEST_DATABASE_URL)("goal actions", () => {
  const users = useTestUsers();
  let ann: { id: string };
  let ben: { id: string };
  let cat: { id: string };
  let annCash: string;
  let benCash: string;
  let catCash: string;
  let householdId: string;

  const annGoals = () => getDb().select().from(goals).where(eq(goals.userId, ann.id));
  async function newGoal(extra: Record<string, unknown> = {}) {
    await signInAs(ann.id);
    expect(await createGoal(goalInput(extra))).toEqual({ ok: true });
    const rows = await annGoals();
    return rows[rows.length - 1];
  }
  const deposit = (goalId: string, accountId: string, amount = "100") =>
    addGoalContribution({ goalId, type: "deposit", accountId, amount, date: "2026-10-10", note: "" });
  const withdraw = (goalId: string, accountId: string, amount = "100") =>
    addGoalContribution({ goalId, type: "withdrawal", accountId, amount, date: "2026-10-11", note: "" });

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
  afterEach(async () => {
    await getDb().delete(goals).where(inArray(goals.userId, [ann.id, ben.id, cat.id]));
  });
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  describe("goals", () => {
    it("creates a goal for the signed-in user", async () => {
      const goal = await newGoal();
      expect(goal).toMatchObject({ userId: ann.id, name: "Travel to Japan", targetAmount: "1000.00", deadline: FUTURE, shared: false, note: null });
    });

    it("validates the input and the deadline", async () => {
      await signInAs(ann.id);
      expect(await createGoal(goalInput({ name: "" }))).toMatchObject({ ok: false, fieldErrors: { name: expect.any(Array) } });
      expect(await createGoal(goalInput({ deadline: "2020-01-01" }))).toMatchObject({
        ok: false,
        fieldErrors: { deadline: ["Deadline must be today or later"] },
      });
      expect(await createGoal(goalInput({ deadline: "" }))).toEqual({ ok: true });
      expect((await annGoals())[0].deadline).toBeNull();
    });

    it("only shares goals when the owner is in a household", async () => {
      await signInAs(cat.id);
      expect(await createGoal(goalInput({ shared: true }))).toMatchObject({ ok: false, fieldErrors: { shared: expect.any(Array) } });
      await signInAs(ann.id);
      expect(await createGoal(goalInput({ shared: true }))).toEqual({ ok: true });
    });

    it("updates only my own goals, and only checks a deadline that changed", async () => {
      const goal = await newGoal();
      expect(await updateGoal(goal.id, goalInput({ name: "Japan 2099", deadline: FUTURE }))).toEqual({ ok: true });
      expect((await annGoals())[0].name).toBe("Japan 2099");
      expect(await updateGoal(goal.id, goalInput({ deadline: "2020-01-01" }))).toMatchObject({ ok: false, fieldErrors: { deadline: expect.any(Array) } });

      // An old deadline that is already in the past can stay while other fields change.
      await getDb().update(goals).set({ deadline: "2020-01-01" }).where(eq(goals.id, goal.id));
      expect(await updateGoal(goal.id, goalInput({ name: "Still editable", deadline: "2020-01-01" }))).toEqual({ ok: true });

      expect(await updateGoal(goal.id, goalInput({ name: "" }))).toMatchObject({ ok: false });
      expect(await updateGoal("nope", goalInput())).toMatchObject({ ok: false });
      expect(await updateGoal(missing, goalInput())).toMatchObject({ ok: false });
      await signInAs(ben.id);
      expect(await updateGoal(goal.id, goalInput({ name: "stolen" }))).toMatchObject({ ok: false });
      expect((await annGoals())[0].name).toBe("Still editable");
    });

    it("refuses to start sharing without a household", async () => {
      await signInAs(cat.id);
      expect(await createGoal(goalInput())).toEqual({ ok: true });
      const [goal] = await getDb().select().from(goals).where(eq(goals.userId, cat.id));
      expect(await updateGoal(goal.id, goalInput({ shared: true }))).toMatchObject({ ok: false, fieldErrors: { shared: expect.any(Array) } });
    });
  });

  describe("contributions", () => {
    it("moves money from my account into the goal and back", async () => {
      const goal = await newGoal();
      expect(await deposit(goal.id, annCash, "150.50")).toEqual({ ok: true });
      expect(await withdraw(goal.id, annCash, "50")).toEqual({ ok: true });
      const rows = await getDb().select().from(goalContributions).where(eq(goalContributions.goalId, goal.id));
      expect(rows.map((r) => [r.type, r.amount, r.userId]).sort()).toEqual([
        ["deposit", "150.50", ann.id],
        ["withdrawal", "50.00", ann.id],
      ]);
    });

    it("rejects invalid input, foreign accounts and unknown goals", async () => {
      const goal = await newGoal();
      expect(await addGoalContribution({})).toMatchObject({ ok: false, fieldErrors: expect.any(Object) });
      expect(await deposit(goal.id, benCash)).toMatchObject({ ok: false, fieldErrors: { accountId: ["Choose one of your accounts"] } });
      expect(await deposit(missing, annCash)).toMatchObject({ ok: false, error: "This goal no longer exists." });
      expect(await withdraw(missing, annCash)).toMatchObject({ ok: false, error: "This goal no longer exists." });
    });

    it("keeps unshared goals private to the owner", async () => {
      const goal = await newGoal();
      await signInAs(ben.id);
      expect(await deposit(goal.id, benCash)).toMatchObject({ ok: false, error: "This goal no longer exists." });
    });

    it("lets household members add to a shared goal from their own accounts", async () => {
      const goal = await newGoal({ shared: true });
      await signInAs(ben.id);
      expect(await deposit(goal.id, benCash, "40")).toEqual({ ok: true });
      await signInAs(cat.id);
      expect(await deposit(goal.id, catCash)).toMatchObject({ ok: false, error: "This goal no longer exists." });
    });

    it("lets everyone take out only what they put in", async () => {
      const goal = await newGoal({ shared: true });
      await deposit(goal.id, annCash, "100");
      await signInAs(ben.id);
      await deposit(goal.id, benCash, "40");
      expect(await withdraw(goal.id, benCash, "50")).toMatchObject({
        ok: false,
        fieldErrors: { amount: [expect.stringContaining("at most $40.00")] },
      });
      expect(await withdraw(goal.id, benCash, "40")).toEqual({ ok: true });
      expect(await withdraw(goal.id, benCash, "1")).toMatchObject({ ok: false, fieldErrors: { amount: ["You have no money in this goal"] } });
      await signInAs(ann.id);
      expect(await withdraw(goal.id, annCash, "100.01")).toMatchObject({ ok: false });
    });

    it("does not take deposits into an archived goal, but still lets money out", async () => {
      const goal = await newGoal();
      await deposit(goal.id, annCash, "10");
      expect(await setGoalArchived(goal.id, true)).toEqual({ ok: true });
      expect(await deposit(goal.id, annCash)).toMatchObject({ ok: false, error: expect.stringContaining("archived") });
      expect(await withdraw(goal.id, annCash, "10")).toEqual({ ok: true });
      expect(await setGoalArchived(goal.id, false)).toEqual({ ok: true });
      expect(await deposit(goal.id, annCash)).toEqual({ ok: true });
    });

    it("maps a database rejection to a friendly message", async () => {
      const goal = await newGoal();
      await deposit(goal.id, annCash, "10");
      const [row] = await getDb().select().from(goalContributions).where(eq(goalContributions.goalId, goal.id));
      const rejected = () => {
        throw Object.assign(new Error("rule"), { code: "23514" });
      };
      // The database enforces the same rules with triggers, e.g. when the goal is archived in between.
      const insert = vi.spyOn(getDb(), "insert").mockImplementationOnce(rejected);
      expect(await deposit(goal.id, annCash)).toEqual({ ok: false, error: "This goal cannot take that change any more." });
      insert.mockRestore();
      const update = vi.spyOn(getDb(), "update").mockImplementationOnce(rejected);
      expect(await updateGoalContribution(row.id, { accountId: annCash, amount: "1", date: "2026-10-10", note: "" })).toMatchObject({ ok: false });
      update.mockRestore();
      const del = vi.spyOn(getDb(), "delete").mockImplementationOnce(rejected);
      expect(await deleteGoalContribution(row.id)).toMatchObject({ ok: false });
      del.mockRestore();
      const broken = vi.spyOn(getDb(), "insert").mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(await deposit(goal.id, annCash)).toMatchObject({ ok: false, error: expect.stringContaining("Something went wrong") });
      broken.mockRestore();
      quiet.mockRestore();
    });

    it("edits and deletes my own contributions only", async () => {
      const goal = await newGoal({ shared: true });
      await deposit(goal.id, annCash, "100");
      const [row] = await getDb().select().from(goalContributions).where(eq(goalContributions.goalId, goal.id));
      expect(await updateGoalContribution(row.id, { accountId: annCash, amount: "120", date: "2026-10-12", note: "more" })).toEqual({ ok: true });
      expect((await getDb().select().from(goalContributions).where(eq(goalContributions.id, row.id)))[0]).toMatchObject({ amount: "120.00", date: "2026-10-12", note: "more" });
      expect(await updateGoalContribution(row.id, { accountId: benCash, amount: "1", date: "2026-10-12", note: "" })).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(Array) } });
      expect(await updateGoalContribution(row.id, { amount: "0" })).toMatchObject({ ok: false });
      expect(await updateGoalContribution("nope", {})).toMatchObject({ ok: false });
      expect(await updateGoalContribution(missing, { accountId: annCash, amount: "1", date: "2026-10-12", note: "" })).toMatchObject({ ok: false });

      await signInAs(ben.id);
      expect(await updateGoalContribution(row.id, { accountId: benCash, amount: "1", date: "2026-10-12", note: "" })).toMatchObject({ ok: false });
      expect(await deleteGoalContribution(row.id)).toMatchObject({ ok: false });
      expect(await deleteGoalContribution("nope")).toMatchObject({ ok: false });

      await signInAs(ann.id);
      expect(await deleteGoalContribution(row.id)).toEqual({ ok: true });
      expect(await getDb().select().from(goalContributions).where(eq(goalContributions.id, row.id))).toHaveLength(0);
    });

    it("does not let a deposit shrink or disappear below what was taken out", async () => {
      const goal = await newGoal();
      await deposit(goal.id, annCash, "100");
      await withdraw(goal.id, annCash, "80");
      const [dep] = await getDb()
        .select()
        .from(goalContributions)
        .where(and(eq(goalContributions.goalId, goal.id), eq(goalContributions.type, "deposit")));
      expect(await updateGoalContribution(dep.id, { accountId: annCash, amount: "50", date: "2026-10-10", note: "" })).toEqual({
        ok: false,
        error: "That would leave less in the goal than you already took out.",
      });
      expect(await deleteGoalContribution(dep.id)).toEqual({
        ok: false,
        error: "That would leave less in the goal than you already took out.",
      });
    });
  });

  describe("archiving and deleting", () => {
    it("archives and restores only my own goals", async () => {
      const goal = await newGoal();
      expect(await setGoalArchived(goal.id, true)).toEqual({ ok: true });
      expect((await annGoals())[0].archivedAt).not.toBeNull();
      expect(await setGoalArchived(goal.id, false)).toEqual({ ok: true });
      expect((await annGoals())[0].archivedAt).toBeNull();
      expect(await setGoalArchived("nope", true)).toMatchObject({ ok: false });
      expect(await setGoalArchived(missing, true)).toMatchObject({ ok: false });
      await signInAs(ben.id);
      expect(await setGoalArchived(goal.id, true)).toMatchObject({ ok: false });
    });

    it("pauses recurring deposits when the goal is archived", async () => {
      const goal = await newGoal();
      const [rule] = await getDb()
        .insert(recurringRules)
        .values({ userId: ann.id, kind: "goal", amount: "5.00", accountId: annCash, goalId: goal.id, frequency: "monthly", startDate: "2099-01-01", nextDueDate: "2099-01-01" })
        .returning();
      await setGoalArchived(goal.id, true);
      expect((await getDb().select().from(recurringRules).where(eq(recurringRules.id, rule.id)))[0]).toMatchObject({ status: "paused", pausedReason: "goal_closed" });
    });

    it("really deletes a goal that was never used", async () => {
      const goal = await newGoal();
      expect(await deleteGoal(goal.id)).toEqual({ ok: true });
      expect(await annGoals()).toHaveLength(0);
    });

    it("blocks deleting a goal that still has money in it", async () => {
      const goal = await newGoal();
      await deposit(goal.id, annCash, "20");
      expect(await deleteGoal(goal.id)).toEqual({ ok: false, error: expect.stringContaining("still has money") });
      expect(await annGoals()).toHaveLength(1);
    });

    it("soft deletes a used goal once it is empty, keeping its history", async () => {
      const goal = await newGoal();
      const [rule] = await getDb()
        .insert(recurringRules)
        .values({ userId: ann.id, kind: "goal", amount: "5.00", accountId: annCash, goalId: goal.id, frequency: "monthly", startDate: "2099-01-01", nextDueDate: "2099-01-01" })
        .returning();
      await deposit(goal.id, annCash, "20");
      await withdraw(goal.id, annCash, "20");
      expect(await deleteGoal(goal.id)).toEqual({ ok: true });
      const [row] = await annGoals();
      expect(row.deletedAt).not.toBeNull();
      expect(await getDb().select().from(goalContributions).where(eq(goalContributions.goalId, goal.id))).toHaveLength(2);
      expect((await getDb().select().from(recurringRules).where(eq(recurringRules.id, rule.id)))[0]).toMatchObject({ status: "ended" });
      // A deleted goal is gone for every action.
      expect(await deleteGoal(goal.id)).toMatchObject({ ok: false });
      expect(await updateGoal(goal.id, goalInput())).toMatchObject({ ok: false });
      expect(await setGoalArchived(goal.id, true)).toMatchObject({ ok: false });
      expect(await deposit(goal.id, annCash)).toMatchObject({ ok: false });
      expect(await deleteGoal("nope")).toMatchObject({ ok: false });
    });

    it("only the owner can delete a goal", async () => {
      const goal = await newGoal({ shared: true });
      await signInAs(ben.id);
      expect(await deleteGoal(goal.id)).toMatchObject({ ok: false });
      expect(await annGoals()).toHaveLength(1);
    });
  });

  describe("household changes", () => {
    it("stops sharing a member's goals when they leave", async () => {
      const [other] = await getDb().insert(households).values({}).returning({ id: households.id });
      const dan = await users.create({ label: "dan", name: "Dan" });
      const eve = await users.create({ label: "eve", name: "Eve" });
      const fay = await users.create({ label: "fay", name: "Fay" });
      await getDb().insert(householdMembers).values([
        { householdId: other.id, userId: dan.id },
        { householdId: other.id, userId: eve.id },
        { householdId: other.id, userId: fay.id },
      ]);
      const mine = await getDb().insert(goals).values([
        { userId: dan.id, name: "D", icon: "tag", color: "#ffd100", targetAmount: "10.00", shared: true },
        { userId: eve.id, name: "E", icon: "tag", color: "#ffd100", targetAmount: "10.00", shared: true },
        { userId: fay.id, name: "F", icon: "tag", color: "#ffd100", targetAmount: "10.00", shared: true },
      ]).returning({ id: goals.id, userId: goals.userId });
      const shared = async (userId: string) => (await getDb().select().from(goals).where(eq(goals.userId, userId)))[0].shared;

      await signInAs(dan.id);
      expect(await leaveHousehold()).toEqual({ ok: true });
      expect(await shared(dan.id)).toBe(false);
      expect(await shared(eve.id)).toBe(true);

      await signInAs(eve.id);
      expect(await removeHouseholdMember(fay.id)).toEqual({ ok: true });
      expect(await shared(fay.id)).toBe(false);
      // Eve is now alone, so the household is gone and nothing stays shared.
      expect(await shared(eve.id)).toBe(false);
      expect(mine).toHaveLength(3);
    });
  });

  describe("deleted goals", () => {
    async function usedAndDeleted() {
      const goal = await newGoal();
      await deposit(goal.id, annCash, "20");
      await withdraw(goal.id, annCash, "20");
      expect(await deleteGoal(goal.id)).toEqual({ ok: true });
      return goal;
    }

    it("restores only my own deleted goals", async () => {
      const goal = await usedAndDeleted();
      await signInAs(ben.id);
      expect(await restoreGoal(goal.id)).toMatchObject({ ok: false });
      await signInAs(ann.id);
      expect(await restoreGoal("nope")).toMatchObject({ ok: false });
      expect(await restoreGoal(goal.id)).toEqual({ ok: true });
      expect((await annGoals())[0].deletedAt).toBeNull();
      expect(await restoreGoal(goal.id)).toMatchObject({ ok: false });
    });

    it("removes a deleted goal permanently only when no movement is on an existing account", async () => {
      const goal = await usedAndDeleted();
      await signInAs(ann.id);
      expect(await deleteGoalPermanently(goal.id)).toEqual({ ok: false, error: expect.stringContaining("existing account") });
      expect(await annGoals()).toHaveLength(1);

      await getDb().update(goalContributions).set({ accountId: null }).where(eq(goalContributions.goalId, goal.id));
      await signInAs(ben.id);
      expect(await deleteGoalPermanently(goal.id)).toMatchObject({ ok: false });
      await signInAs(ann.id);
      expect(await deleteGoalPermanently("nope")).toMatchObject({ ok: false });
      expect(await deleteGoalPermanently(goal.id)).toEqual({ ok: true });
      expect(await annGoals()).toHaveLength(0);
      expect(await getDb().select().from(goalContributions).where(eq(goalContributions.goalId, goal.id))).toHaveLength(0);
    });

    it("refuses to remove a goal that is not deleted", async () => {
      const goal = await newGoal();
      expect(await deleteGoalPermanently(goal.id)).toMatchObject({ ok: false });
      expect(await annGoals()).toHaveLength(1);
    });
  });

  it("lets an account with goal money be deleted and keeps the goal's history", async () => {
    const goal = await newGoal();
    const [extra] = await getDb().insert(accounts).values({ userId: ann.id, name: "Temp", type: "bank", color: "#337ab7", icon: "landmark" }).returning({ id: accounts.id });
    await deposit(goal.id, extra.id, "5");
    await getDb().delete(accounts).where(eq(accounts.id, extra.id));
    const [row] = await getDb().select().from(goalContributions).where(eq(goalContributions.goalId, goal.id));
    expect(row).toMatchObject({ accountId: null, accountName: "Temp", amount: "5.00" });
    expect(await addGoalContribution({ goalId: goal.id, type: "withdrawal", accountId: annCash, amount: "5", date: "2026-10-11", note: "" })).toEqual({ ok: true });
  });
});
