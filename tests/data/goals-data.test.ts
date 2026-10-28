import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, goalContributions, goals, householdMembers, households } from "@/db/schema";
import { listAccounts, listHouseholdAccounts } from "@/lib/data/accounts";
import { getDashboard } from "@/lib/data/dashboard";
import { getGoal, getGoalHistory, getGoalsOverview, listDeletedGoals, listGoalContributions, listGoalContributors, listGoals } from "@/lib/data/goals";
import { getBalanceOverTime } from "@/lib/data/reports";
import { defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const today = "2026-10-15";

describe.skipIf(!TEST_DATABASE_URL)("goals data", () => {
  const users = useTestUsers();
  let ann: { id: string };
  let ben: { id: string };
  let cat: { id: string };
  let annCash: string;
  let benCash: string;
  let householdId: string;

  async function addGoal(userId: string, extra: Partial<typeof goals.$inferInsert> = {}) {
    const [row] = await getDb()
      .insert(goals)
      .values({ userId, name: "Japan", icon: "plane", color: "#ffd100", targetAmount: "1000.00", ...extra })
      .returning();
    return row;
  }
  async function contribute(goalId: string, userId: string, accountId: string, amount: string, date: string, type: "deposit" | "withdrawal" = "deposit") {
    await getDb().insert(goalContributions).values({ goalId, userId, accountId, type, amount, date });
  }

  beforeAll(async () => {
    ann = await users.create({ label: "ann", name: "Ann" });
    ben = await users.create({ label: "ben", name: "Ben" });
    cat = await users.create({ label: "cat", name: "Cat" });
    [annCash, benCash] = await Promise.all([ann, ben].map((u) => defaultAccountId(u.id)));
    const [household] = await getDb().insert(households).values({}).returning({ id: households.id });
    householdId = household.id;
    await getDb().insert(householdMembers).values([
      { householdId, userId: ann.id },
      { householdId, userId: ben.id },
    ]);
  });
  afterEach(() => getDb().delete(goals).where(inArray(goals.userId, [ann.id, ben.id, cat.id])));
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  it("computes saved amounts, my share and the used flag", async () => {
    const goal = await addGoal(ann.id, { shared: true, note: "trip" });
    await contribute(goal.id, ann.id, annCash, "300.00", "2026-10-01");
    await contribute(goal.id, ben.id, benCash, "120.50", "2026-10-02");
    await contribute(goal.id, ann.id, annCash, "50.00", "2026-10-03", "withdrawal");
    await addGoal(ann.id, { name: "Empty", targetAmount: "5.00" });

    await signInAs(ann.id);
    const list = await listGoals();
    const japan = list.find((g) => g.name === "Japan")!;
    expect(japan).toMatchObject({
      saved: "370.50",
      mySaved: "250.00",
      used: true,
      shared: true,
      archived: false,
      note: "trip",
      targetAmount: "1000.00",
      owner: { name: "Ann", isMine: true },
    });
    expect(list.find((g) => g.name === "Empty")).toMatchObject({ saved: "0.00", used: false });

    await signInAs(ben.id);
    expect(await getGoal(goal.id)).toMatchObject({ saved: "370.50", mySaved: "120.50", owner: { name: "Ann", isMine: false } });
  });

  it("shows goals to their owner, their shared goals to the household and nothing to strangers", async () => {
    const mineOnly = await addGoal(ann.id, { name: "Private" });
    const shared = await addGoal(ann.id, { name: "Shared", shared: true });
    const archived = await addGoal(ann.id, { name: "Old", shared: true, archivedAt: new Date() });
    const deleted = await addGoal(ann.id, { name: "Gone", shared: true, deletedAt: new Date() });

    await signInAs(ann.id);
    expect((await listGoals()).map((g) => g.name).sort()).toEqual(["Old", "Private", "Shared"]);
    await signInAs(ben.id);
    expect((await listGoals()).map((g) => g.name).sort()).toEqual(["Old", "Shared"]);
    expect(await getGoal(mineOnly.id)).toBeNull();
    expect(await getGoal(shared.id)).not.toBeNull();
    expect((await getGoal(archived.id))?.archived).toBe(true);
    expect(await getGoal(deleted.id)).toBeNull();
    await signInAs(cat.id);
    expect(await listGoals()).toEqual([]);
    expect(await getGoal(shared.id)).toBeNull();
    expect(await getGoal("not-an-id")).toBeNull();
    expect(await listGoalContributors(shared.id)).toEqual([]);
    expect(await listGoalContributions(shared.id)).toEqual([]);
    expect(await getGoalHistory(shared.id)).toEqual([]);
  });

  it("still shows a goal to someone who has money in it after it stopped being shared", async () => {
    const goal = await addGoal(ann.id, { shared: true });
    await contribute(goal.id, ben.id, benCash, "25.00", "2026-10-02");
    await getDb().update(goals).set({ shared: false }).where(eq(goals.id, goal.id));
    await signInAs(ben.id);
    expect((await listGoals()).map((g) => g.id)).toEqual([goal.id]);
    await signInAs(cat.id);
    expect(await listGoals()).toEqual([]);
  });

  it("keeps showing the goal, with its owner's name, to a former household member who has money in it", async () => {
    const goal = await addGoal(ann.id, { shared: true });
    await contribute(goal.id, ben.id, benCash, "25.00", "2026-10-02");
    await getDb().update(goals).set({ shared: false }).where(eq(goals.id, goal.id));
    await getDb().delete(householdMembers).where(eq(householdMembers.userId, ben.id));
    try {
      await signInAs(ben.id);
      expect(await getGoal(goal.id)).toMatchObject({ owner: { id: ann.id, name: "Ann", isMine: false }, mySaved: "25.00" });
    } finally {
      await getDb().insert(householdMembers).values({ householdId, userId: ben.id });
    }
  });

  it("shows my contributions of a deleted account with the name it had", async () => {
    const goal = await addGoal(ann.id);
    const [old] = await getDb()
      .insert(accounts)
      .values({ userId: ann.id, name: "Old wallet", type: "cash", color: "#9cca56", icon: "banknote" })
      .returning({ id: accounts.id });
    await contribute(goal.id, ann.id, old.id, "12.00", "2026-10-05");
    await getDb().delete(accounts).where(eq(accounts.id, old.id));
    await signInAs(ann.id);
    const [item] = await listGoalContributions(goal.id);
    expect(item.account).toEqual({ id: null, name: "Old wallet" });
  });

  it("lists my deleted goals, and whether they can be removed permanently", async () => {
    const stuck = await addGoal(ann.id, { name: "Stuck" });
    await contribute(stuck.id, ann.id, annCash, "5.00", "2026-10-01");
    const free = await addGoal(ann.id, { name: "Free" });
    const [gone] = await getDb()
      .insert(accounts)
      .values({ userId: ann.id, name: "Gone", type: "cash", color: "#9cca56", icon: "banknote" })
      .returning({ id: accounts.id });
    await contribute(free.id, ann.id, gone.id, "5.00", "2026-10-01");
    await getDb().delete(accounts).where(eq(accounts.id, gone.id));
    await getDb().update(goals).set({ deletedAt: new Date("2026-10-02T00:00:00Z") }).where(eq(goals.id, stuck.id));
    await getDb().update(goals).set({ deletedAt: new Date("2026-10-03T00:00:00Z") }).where(eq(goals.id, free.id));
    await addGoal(ann.id, { name: "Visible" });
    await addGoal(ben.id, { name: "Bens", deletedAt: new Date() });

    await signInAs(ann.id);
    expect((await listDeletedGoals()).map((g) => [g.name, g.canDeletePermanently])).toEqual([
      ["Free", true],
      ["Stuck", false],
    ]);
    expect((await listGoals()).map((g) => g.name)).toEqual(["Visible"]);
  });

  it("lists contributors with money left, and contributions with accounts hidden for others", async () => {
    const goal = await addGoal(ann.id, { shared: true });
    await contribute(goal.id, ann.id, annCash, "10.00", "2026-10-01");
    await contribute(goal.id, ben.id, benCash, "30.00", "2026-10-02");
    await contribute(goal.id, ben.id, benCash, "30.00", "2026-10-03", "withdrawal");
    await signInAs(ann.id);
    expect(await listGoalContributors(goal.id)).toEqual([{ userId: ann.id, name: "Ann", isMe: true, saved: "10.00" }]);
    const items = await listGoalContributions(goal.id);
    expect(items.map((i) => [i.type, i.amount, i.by.name, i.by.isMine, i.account?.name ?? null])).toEqual([
      ["withdrawal", "30.00", "Ben", false, null],
      ["deposit", "30.00", "Ben", false, null],
      ["deposit", "10.00", "Ann", true, "Cash"],
    ]);

    await contribute(goal.id, ben.id, benCash, "5.00", "2026-10-04");
    expect((await listGoalContributors(goal.id)).map((c) => [c.name, c.saved])).toEqual([["Ann", "10.00"], ["Ben", "5.00"]]);
    // Someone who left the household shows as a former member.
    await getDb().delete(householdMembers).where(eq(householdMembers.userId, ben.id));
    try {
      await signInAs(cat.id);
      await getDb().update(goals).set({ shared: false }).where(eq(goals.id, goal.id));
      await signInAs(ann.id);
      const names = (await listGoalContributors(goal.id)).map((c) => c.name);
      expect(names).toEqual(["Ann", "Former member"]);
      expect((await listGoalContributions(goal.id))[0].by.name).toBe("Former member");
    } finally {
      await getDb().insert(householdMembers).values({ householdId, userId: ben.id });
    }
  });

  it("builds the saved-over-time series", async () => {
    const goal = await addGoal(ann.id);
    await contribute(goal.id, ann.id, annCash, "100.00", "2026-09-01");
    await contribute(goal.id, ann.id, annCash, "50.00", "2026-09-01");
    await contribute(goal.id, ann.id, annCash, "30.00", "2026-09-15", "withdrawal");
    await contribute(goal.id, ann.id, annCash, "10.00", "2026-10-02");
    await signInAs(ann.id);
    expect(await getGoalHistory(goal.id)).toEqual([
      { date: "2026-09-01", saved: "150.00" },
      { date: "2026-09-15", saved: "120.00" },
      { date: "2026-10-02", saved: "130.00" },
    ]);
  });

  it("subtracts goal money from account balances, the dashboard total and the balance report", async () => {
    const goal = await addGoal(ann.id, { shared: true });
    await contribute(goal.id, ann.id, annCash, "200.00", "2026-10-01");
    await contribute(goal.id, ann.id, annCash, "50.00", "2026-10-02", "withdrawal");
    await contribute(goal.id, ben.id, benCash, "75.00", "2026-10-03");

    await signInAs(ann.id);
    expect((await listAccounts())[0].balance).toBe("-150.00");
    expect((await listHouseholdAccounts())[0]).toMatchObject({ ownerName: "Ben", balance: "-75.00" });
    expect(await getDashboard(today, "mine")).toMatchObject({ totalBalance: "-150.00", income: "0.00", expense: "0.00", net: "0.00" });
    expect(await getDashboard(today, "household")).toMatchObject({ totalBalance: "-225.00" });
    expect((await getDashboard(today, "mine")).goals).toMatchObject({ inGoals: "150.00" });
    expect((await getDashboard(today, "household")).goals).toMatchObject({ inGoals: "225.00" });

    const report = await getBalanceOverTime({ range: { start: "2026-09-01", end: "2026-10-31" } });
    expect(report.total).toEqual(["0.00", "-225.00"]);
  });

  it("gives the dashboard the open goals, soonest deadline first", async () => {
    await addGoal(ann.id, { name: "Later", deadline: "2027-01-01" });
    await addGoal(ann.id, { name: "Sooner", deadline: "2026-12-01" });
    await addGoal(ann.id, { name: "Whenever", deadline: null });
    await addGoal(ann.id, { name: "Archived", archivedAt: new Date() });
    await signInAs(ann.id);
    const overview = await getGoalsOverview([ann.id], 3);
    expect(overview.active.map((g) => g.name)).toEqual(["Sooner", "Later", "Whenever"]);
    expect(overview.inGoals).toBe("0.00");
    expect((await getGoalsOverview([], 1)).active).toHaveLength(1);
  });
});
