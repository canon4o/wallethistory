import { afterAll, describe, expect, it } from "vitest";
import { connectTestDb, TEST_DATABASE_URL } from "../helpers/test-db";

// Runs against DATABASE_URL_TEST (a disposable database). Skipped when it is not set.
describe.skipIf(!TEST_DATABASE_URL)("budget alerts integrity (migration 0016)", () => {
  const sql = TEST_DATABASE_URL ? connectTestDb() : (null as never);
  const created: string[] = [];

  async function createUser(label: string) {
    const email = `${label}-${crypto.randomUUID()}@test.local`;
    const [user] = await sql<{ id: string }[]>`
      insert into users (email, name, password_hash) values (${email}, ${label}, 'hash') returning id`;
    created.push(user.id);
    const [category] = await sql<{ id: string }[]>`
      select id from categories where user_id = ${user.id} and type = 'expense' limit 1`;
    const [budget] = await sql<{ id: string }[]>`
      insert into budgets (user_id, category_id, amount) values (${user.id}, ${category.id}, 100) returning id`;
    return { id: user.id, budget: budget.id };
  }
  const dismiss = (user: string, budget: string, level: "warning" | "exceeded" = "warning", start = "2026-10-01") =>
    sql`insert into budget_alert_dismissals (user_id, budget_id, period_start, level) values (${user}, ${budget}, ${start}, ${level})`;
  const count = async (where: { budget?: string; user?: string }) =>
    (
      await sql<{ n: number }[]>`
        select count(*)::int as n from budget_alert_dismissals
        where (${where.budget ?? null}::uuid is null or budget_id = ${where.budget ?? null})
          and (${where.user ?? null}::uuid is null or user_id = ${where.user ?? null})`
    )[0].n;

  afterAll(async () => {
    if (created.length) await sql`delete from users where id in ${sql(created)}`;
    await sql.end();
  });

  it("new users have alerts on with an 80% threshold", async () => {
    const ann = await createUser("ann");
    const [row] = await sql`select budget_alerts_enabled, budget_alert_threshold from users where id = ${ann.id}`;
    expect(row).toMatchObject({ budget_alerts_enabled: true, budget_alert_threshold: 80 });
  });

  it("limits the threshold to 50..99", async () => {
    const ann = await createUser("ann");
    for (const ok of [50, 99]) await sql`update users set budget_alert_threshold = ${ok} where id = ${ann.id}`;
    for (const bad of [49, 100]) {
      await expect(sql`update users set budget_alert_threshold = ${bad} where id = ${ann.id}`).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("accepts a dismissal on the user's own budget", async () => {
    const ann = await createUser("ann");
    await dismiss(ann.id, ann.budget);
    expect(await count({ budget: ann.budget })).toBe(1);
  });

  it("rejects a dismissal of another user's budget", async () => {
    const ann = await createUser("ann");
    const ben = await createUser("ben");
    await expect(dismiss(ben.id, ann.budget)).rejects.toMatchObject({ code: "23514" });
    expect(await count({ budget: ann.budget })).toBe(0);
  });

  it("is unique per budget, period start and level", async () => {
    const ann = await createUser("ann");
    await dismiss(ann.id, ann.budget);
    await expect(dismiss(ann.id, ann.budget)).rejects.toMatchObject({ code: "23505" });
    await dismiss(ann.id, ann.budget, "exceeded");
    await dismiss(ann.id, ann.budget, "warning", "2026-11-01");
    expect(await count({ budget: ann.budget })).toBe(3);
  });

  it("is removed with its budget", async () => {
    const ann = await createUser("ann");
    await dismiss(ann.id, ann.budget);
    await sql`delete from budgets where id = ${ann.budget}`;
    expect(await count({ user: ann.id })).toBe(0);
  });

  it("is removed with its user", async () => {
    const ann = await createUser("ann");
    await dismiss(ann.id, ann.budget);
    await sql`delete from users where id = ${ann.id}`;
    expect(await count({ user: ann.id })).toBe(0);
  });

  it("has row level security enabled", async () => {
    const [row] = await sql`select relrowsecurity from pg_class where relname = 'budget_alert_dismissals'`;
    expect(row.relrowsecurity).toBe(true);
  });
});
