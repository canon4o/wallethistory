import { afterAll, describe, expect, it } from "vitest";
import { connectTestDb, TEST_DATABASE_URL } from "../helpers/test-db";

// Runs against DATABASE_URL_TEST (a disposable database). Skipped when it is not set.
describe.skipIf(!TEST_DATABASE_URL)("goal integrity (migration 0013)", () => {
  const sql = TEST_DATABASE_URL ? connectTestDb() : (null as never);
  const created: string[] = [];

  async function createUser(label: string) {
    const email = `${label}-${crypto.randomUUID()}@test.local`;
    const [user] = await sql<{ id: string }[]>`
      insert into users (email, name, password_hash) values (${email}, ${label}, 'hash') returning id`;
    created.push(user.id);
    const [account] = await sql<{ id: string }[]>`select id from accounts where user_id = ${user.id}`;
    return { id: user.id, account: account.id };
  }
  async function createGoal(owner: string, extra: { shared?: boolean; archived?: boolean; deleted?: boolean } = {}) {
    const [goal] = await sql<{ id: string }[]>`
      insert into goals (user_id, name, icon, color, target_amount, shared, archived_at, deleted_at)
      values (${owner}, 'Trip', 'plane', '#ffd100', 100, ${extra.shared ?? false},
        ${extra.archived ? sql`now()` : null}, ${extra.deleted ? sql`now()` : null})
      returning id`;
    return goal.id;
  }
  const contribute = (goal: string, user: { id: string; account: string }, type: "deposit" | "withdrawal", amount: number, account = user.account) =>
    sql`insert into goal_contributions (goal_id, user_id, account_id, type, amount, date)
        values (${goal}, ${user.id}, ${account}, ${type}, ${amount}, '2026-10-01')`;
  const rejected = (promise: PromiseLike<unknown>) => expect(promise).rejects.toMatchObject({ code: "23514" });

  afterAll(async () => {
    if (created.length) await sql`delete from users where id in ${sql(created)}`;
    await sql.end();
  });

  it("accepts a deposit into my goal and takes it out again", async () => {
    const ann = await createUser("ann");
    const goal = await createGoal(ann.id);
    await contribute(goal, ann, "deposit", 40);
    await contribute(goal, ann, "withdrawal", 40);
    await rejected(contribute(goal, ann, "withdrawal", 0.01));
  });

  it("rejects an account that is not the contributor's", async () => {
    const ann = await createUser("ann");
    const ben = await createUser("ben");
    const goal = await createGoal(ann.id);
    await rejected(contribute(goal, ann, "deposit", 5, ben.account));
  });

  it("keeps goal movements, with the account name, when the account is deleted", async () => {
    const ann = await createUser("ann");
    const [extra] = await sql<{ id: string }[]>`
      insert into accounts (user_id, name, type, color, icon) values (${ann.id}, 'Old wallet', 'cash', '#9cca56', 'banknote') returning id`;
    const goal = await createGoal(ann.id);
    await contribute(goal, ann, "deposit", 30, extra.id);
    await sql`update goals set archived_at = now() where id = ${goal}`;
    await sql`delete from accounts where id = ${extra.id}`;
    const [row] = await sql`select account_id, account_name, amount::text from goal_contributions where goal_id = ${goal}`;
    expect(row).toMatchObject({ account_id: null, account_name: "Old wallet", amount: "30.00" });
    // The row without an account still counts towards the goal and can be withdrawn from.
    await sql`update goals set archived_at = null where id = ${goal}`;
    await contribute(goal, ann, "withdrawal", 30);
    await rejected(sql`
      insert into goal_contributions (goal_id, user_id, account_id, type, amount, date)
      values (${goal}, ${ann.id}, null, 'deposit', 5, '2026-10-01')`);
  });

  it("rejects deposits into unavailable goals", async () => {
    const ann = await createUser("ann");
    const ben = await createUser("ben");
    await rejected(contribute(await createGoal(ann.id), ben, "deposit", 5));
    await rejected(contribute(await createGoal(ann.id, { shared: true }), ben, "deposit", 5));
    await rejected(contribute(await createGoal(ann.id, { archived: true }), ann, "deposit", 5));
    await rejected(contribute(await createGoal(ann.id, { deleted: true }), ann, "deposit", 5));
    await rejected(contribute("00000000-0000-4000-8000-000000000000", ann, "deposit", 5));
  });

  it("accepts deposits from household members into a shared goal", async () => {
    const ann = await createUser("ann");
    const ben = await createUser("ben");
    const [{ id: household }] = await sql<{ id: string }[]>`insert into households default values returning id`;
    await sql`insert into household_members (household_id, user_id) values (${household}, ${ann.id}), (${household}, ${ben.id})`;
    const goal = await createGoal(ann.id, { shared: true });
    await contribute(goal, ben, "deposit", 5);
    await contribute(goal, ben, "withdrawal", 5);
    await sql`delete from households where id = ${household}`;
    await rejected(contribute(goal, ben, "deposit", 5));
  });

  it("checks the contributor's balance when a deposit is edited or deleted", async () => {
    const ann = await createUser("ann");
    const goal = await createGoal(ann.id);
    await contribute(goal, ann, "deposit", 50);
    await contribute(goal, ann, "withdrawal", 30);
    await rejected(sql`update goal_contributions set amount = 20 where goal_id = ${goal} and type = 'deposit'`);
    await rejected(sql`delete from goal_contributions where goal_id = ${goal} and type = 'deposit'`);
    await sql`update goal_contributions set amount = 30, note = 'ok' where goal_id = ${goal} and type = 'deposit'`;
    await sql`update goal_contributions set note = 'edit after archive' where goal_id = ${goal} and type = 'deposit'`;
    await sql`update goals set archived_at = now() where id = ${goal}`;
    await sql`update goal_contributions set note = 'still editable' where goal_id = ${goal}`;
  });

  it("serializes concurrent withdrawals so nobody takes out more than they put in", async () => {
    const ann = await createUser("ann");
    const goal = await createGoal(ann.id);
    await contribute(goal, ann, "deposit", 10);
    const results = await Promise.allSettled([contribute(goal, ann, "withdrawal", 10), contribute(goal, ann, "withdrawal", 10)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("checks the goal rule shape and that the goal is usable by the rule owner", async () => {
    const ann = await createUser("ann");
    const ben = await createUser("ben");
    const goal = await createGoal(ann.id);
    const rule = (owner: { id: string; account: string }, goalId: string | null, kind = "goal") =>
      sql`insert into recurring_rules (user_id, kind, amount, account_id, goal_id, frequency, start_date, next_due_date)
          values (${owner.id}, ${kind}, 5, ${owner.account}, ${goalId}, 'monthly', '2099-01-01', '2099-01-01')`;
    await rule(ann, goal);
    await rejected(rule(ben, goal));
    await expect(rule(ann, null)).rejects.toMatchObject({ code: "23514" });
    await expect(rule(ann, goal, "expense")).rejects.toMatchObject({ code: "23514" });
  });

  it("cascades goals and contributions when a user is deleted", async () => {
    const ann = await createUser("ann");
    const ben = await createUser("ben");
    const [{ id: household }] = await sql<{ id: string }[]>`insert into households default values returning id`;
    await sql`insert into household_members (household_id, user_id) values (${household}, ${ann.id}), (${household}, ${ben.id})`;
    const goal = await createGoal(ann.id, { shared: true });
    await contribute(goal, ben, "deposit", 5);
    await contribute(goal, ann, "deposit", 5);
    await sql`delete from users where id = ${ann.id}`;
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from goal_contributions where goal_id = ${goal}`;
    expect(n).toBe(0);
    await sql`delete from households where id = ${household}`;
  });
});
