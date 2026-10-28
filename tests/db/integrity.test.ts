import { afterAll, describe, expect, it } from "vitest";
import { connectTestDb, TEST_DATABASE_URL } from "../helpers/test-db";

// Runs against DATABASE_URL_TEST (a disposable database). Skipped when it is not set.
describe.skipIf(!TEST_DATABASE_URL)("database integrity (migrations)", () => {
  const sql = TEST_DATABASE_URL ? connectTestDb() : (null as never);
  const created: string[] = [];

  async function createUser(label: string) {
    const email = `${label}-${crypto.randomUUID()}@test.local`;
    const [user] = await sql<{ id: string }[]>`
      insert into users (email, name, password_hash) values (${email}, ${label}, 'hash') returning id`;
    created.push(user.id);
    return user.id;
  }

  async function lookup(userId: string) {
    const [account] = await sql<{ id: string }[]>`select id from accounts where user_id = ${userId}`;
    const [income] = await sql<{ id: string }[]>`
      select id from categories where user_id = ${userId} and type = 'income' and name = 'Salary'`;
    const [expense] = await sql<{ id: string }[]>`
      select id from categories where user_id = ${userId} and type = 'expense' and name = 'Rent'`;
    return { account: account.id, income: income.id, expense: expense.id };
  }

  afterAll(async () => {
    if (created.length) await sql`delete from users where id in ${sql(created)}`;
    await sql.end();
  });

  it("seeds the dev admin with a bcrypt hash", async () => {
    const [admin] = await sql<{ password_hash: string; email_verified_at: Date | null }[]>`
      select password_hash, email_verified_at from users where lower(email) = 'admin@admin.com'`;
    expect(admin.password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(admin.email_verified_at).not.toBeNull();
  });

  it("creates Cash and the default categories for a new user", async () => {
    const id = await createUser("defaults");
    const accounts = await sql`select name, type, color, icon, initial_balance from accounts where user_id = ${id}`;
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: "Cash", type: "cash", color: "#9cca56", icon: "banknote" });
    const counts = await sql<{ type: string; n: number }[]>`
      select type, count(*)::int as n from categories where user_id = ${id} group by type`;
    expect(Object.fromEntries(counts.map((c) => [c.type, c.n]))).toEqual({ income: 5, expense: 11 });
    expect(await sql`select 1 from tags where user_id = ${id}`).toHaveLength(0);
  });

  it("rejects a transaction whose type does not match its category", async () => {
    const id = await createUser("mismatch");
    const ids = await lookup(id);
    await expect(sql`
      insert into transactions (user_id, type, amount, date, account_id, category_id)
      values (${id}, 'expense', 10, '2026-01-01', ${ids.account}, ${ids.income})`).rejects.toThrow(
      /does not match category type/,
    );
  });

  it("rejects ids that belong to another user", async () => {
    const a = await createUser("owner");
    const b = await createUser("intruder");
    const ids = await lookup(a);
    await expect(sql`
      insert into transactions (user_id, type, amount, date, account_id)
      values (${b}, 'expense', 10, '2026-01-01', ${ids.account})`).rejects.toThrow(/account does not belong/);
    await expect(sql`
      insert into transactions (user_id, type, amount, date, account_id, category_id)
      values (${a}, 'expense', 10, '2026-01-01', ${ids.account}, ${(await lookup(b)).expense})`).rejects.toThrow(
      /category does not belong/,
    );
  });

  it("rejects non-positive amounts", async () => {
    const id = await createUser("amount");
    const ids = await lookup(id);
    await expect(sql`
      insert into transactions (user_id, type, amount, date, account_id)
      values (${id}, 'expense', 0, '2026-01-01', ${ids.account})`).rejects.toThrow(/transactions_amount_positive/);
  });

  it("locks category type and enforces unique names per type", async () => {
    const id = await createUser("categories");
    const ids = await lookup(id);
    await expect(sql`update categories set type = 'income' where id = ${ids.expense}`).rejects.toThrow(
      /cannot be changed/,
    );
    await expect(sql`
      insert into categories (user_id, type, name, color, icon) values (${id}, 'income', 'salary', '#000000', 'tag')`).rejects.toThrow(
      /categories_user_type_name_idx/,
    );
    await sql`insert into categories (user_id, type, name, color, icon) values (${id}, 'income', 'Rent', '#000000', 'tag')`;
    await expect(sql`
      insert into categories (user_id, type, name, color, icon) values (${id}, 'income', 'Bad', 'red', 'tag')`).rejects.toThrow(
      /categories_color_hex/,
    );
  });

  it("allows budgets on expense categories only, once per period", async () => {
    const id = await createUser("budgets");
    const ids = await lookup(id);
    await expect(sql`insert into budgets (user_id, category_id, amount) values (${id}, ${ids.income}, 50)`).rejects.toThrow(
      /expense category/,
    );
    await sql`insert into budgets (user_id, category_id, amount) values (${id}, ${ids.expense}, 50)`;
    await expect(sql`insert into budgets (user_id, category_id, amount) values (${id}, ${ids.expense}, 60)`).rejects.toThrow(
      /budgets_user_category_period_idx/,
    );
    await sql`insert into budgets (user_id, category_id, amount, period) values (${id}, ${ids.expense}, 60, 'weekly')`;
  });

  it("rejects a tag from another user on a transaction", async () => {
    const a = await createUser("tag-a");
    const b = await createUser("tag-b");
    const ids = await lookup(a);
    const [txn] = await sql<{ id: string }[]>`
      insert into transactions (user_id, type, amount, date, account_id)
      values (${a}, 'expense', 5, '2026-01-01', ${ids.account}) returning id`;
    const [foreignTag] = await sql<{ id: string }[]>`insert into tags (user_id, name) values (${b}, 'x') returning id`;
    await expect(sql`insert into transaction_tags values (${txn.id}, ${foreignTag.id})`).rejects.toThrow(
      /different users/,
    );
  });

  it("blocks deleting an account or category that has transactions", async () => {
    const id = await createUser("in-use");
    const ids = await lookup(id);
    await sql`
      insert into transactions (user_id, type, amount, date, account_id, category_id)
      values (${id}, 'expense', 5, '2026-01-01', ${ids.account}, ${ids.expense})`;
    await expect(sql`delete from accounts where id = ${ids.account}`).rejects.toThrow(/foreign key/);
    await expect(sql`delete from categories where id = ${ids.expense}`).rejects.toThrow(/foreign key/);
  });

  it("deletes every row of a user when the user is deleted", async () => {
    const id = await createUser("cascade");
    const ids = await lookup(id);
    const [txn] = await sql<{ id: string }[]>`
      insert into transactions (user_id, type, amount, date, account_id, category_id)
      values (${id}, 'expense', 5, '2026-01-01', ${ids.account}, ${ids.expense}) returning id`;
    const [tag] = await sql<{ id: string }[]>`insert into tags (user_id, name) values (${id}, 't') returning id`;
    await sql`insert into transaction_tags values (${txn.id}, ${tag.id})`;
    await sql`insert into budgets (user_id, category_id, amount) values (${id}, ${ids.expense}, 50)`;
    await sql`insert into sessions (user_id, token_hash, expires_at) values (${id}, ${`s-${id}`}, now() + interval '1 day')`;
    await sql`insert into auth_tokens (user_id, type, token_hash, expires_at) values (${id}, 'password_reset', ${`t-${id}`}, now() + interval '1 hour')`;

    await sql`delete from users where id = ${id}`;

    const [left] = await sql<Record<string, number>[]>`
      select
        (select count(*) from accounts where user_id = ${id})::int as accounts,
        (select count(*) from categories where user_id = ${id})::int as categories,
        (select count(*) from tags where user_id = ${id})::int as tags,
        (select count(*) from transactions where user_id = ${id})::int as transactions,
        (select count(*) from budgets where user_id = ${id})::int as budgets,
        (select count(*) from sessions where user_id = ${id})::int as sessions,
        (select count(*) from auth_tokens where user_id = ${id})::int as auth_tokens,
        (select count(*) from transaction_tags where transaction_id = ${txn.id})::int as transaction_tags`;
    expect(Object.values(left).every((n) => n === 0)).toBe(true);
  });

  it("has row level security enabled on every table", async () => {
    const tables = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> '__drizzle_migrations'`;
    expect(tables).toHaveLength(22);
    expect(tables.every((t) => t.relrowsecurity)).toBe(true);
  });
});
