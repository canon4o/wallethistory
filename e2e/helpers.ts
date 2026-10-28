import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { expect, type Locator, type Page } from "@playwright/test";

const MAIL_LOG = path.resolve(__dirname, "../.e2e-mail.log");

export const ADMIN = { email: "admin@admin.com", password: "adminpass", name: "Admin" };

export function uniqueEmail(label: string) {
  return `e2e-${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
}

/** Returns the first link of the most recent email printed for this address (console fallback). */
export async function latestEmailLink(email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      () => {
        const log = readFileSync(MAIL_LOG, "utf8");
        const blocks = log.split("=== Email").filter((block) => block.includes(`To: ${email}`));
        const last = blocks[blocks.length - 1];
        link = last?.match(/https?:\/\/\S+/)?.[0];
        return link;
      },
      { message: `no email link for ${email}` },
    )
    .toBeTruthy();
  return link as string;
}

/** Inserts a verified user straight into the test database (the signup trigger adds defaults). */
export async function createUserInDb(email: string, password: string, name = "E2E User") {
  const sql = postgres(process.env.DATABASE_URL_TEST as string, { prepare: false });
  try {
    await sql`
      insert into users (email, name, password_hash, email_verified_at)
      values (${email}, ${name}, ${await bcrypt.hash(password, 4)}, now())`;
  } finally {
    await sql.end();
  }
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Runs a query against the disposable test database (E2E assertions and data setup). */
export async function queryDb<T extends object = Record<string, unknown>>(
  run: (sql: postgres.Sql) => Promise<T[]> | postgres.PendingQuery<postgres.Row[]>,
): Promise<T[]> {
  const sql = postgres(process.env.DATABASE_URL_TEST as string, { prepare: false });
  try {
    return (await run(sql)) as unknown as T[];
  } finally {
    await sql.end();
  }
}

export async function userIdByEmail(email: string): Promise<string> {
  const [row] = await queryDb<{ id: string }>((sql) => sql`select id from users where email = ${email}`);
  return row.id;
}

/** Adds an expense transaction on the user's first account (used to test "in use" blocking). */
export async function addTransactionFor(email: string, categoryName?: string) {
  const userId = await userIdByEmail(email);
  await queryDb((sql) => sql`
    insert into transactions (user_id, type, amount, date, account_id, category_id)
    select ${userId}, 'expense', 10, '2026-01-01', a.id,
           (select c.id from categories c where c.user_id = ${userId} and c.type = 'expense' and c.name = ${categoryName ?? ""})
    from accounts a where a.user_id = ${userId} limit 1`);
}

export async function addTagFor(email: string, name: string) {
  const userId = await userIdByEmail(email);
  await queryDb((sql) => sql`insert into tags (user_id, name) values (${userId}, ${name})`);
}

/** Inserts `count` expense transactions on consecutive days, newest note last ("bulk 1" is the oldest). */
export async function addBulkTransactions(email: string, count: number) {
  const userId = await userIdByEmail(email);
  await queryDb((sql) => sql`
    insert into transactions (user_id, type, amount, date, account_id, note)
    select ${userId}, 'expense', 1, date '2026-01-01' + g, (select id from accounts where user_id = ${userId} limit 1), 'bulk ' || g
    from generate_series(1, ${count}::int) as g`);
}

/** Today's date as the server sees it (UTC), `YYYY-MM-DD`. */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Date `days` from today (UTC); negative for the past. */
export function daysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Records an expense in a named expense category on the user's first account. */
export async function addExpenseFor(email: string, categoryName: string, amount: string, date: string) {
  const userId = await userIdByEmail(email);
  await queryDb((sql) => sql`
    insert into transactions (user_id, type, amount, date, account_id, category_id)
    select ${userId}, 'expense', ${amount}::numeric, ${date}::date, a.id,
           (select c.id from categories c where c.user_id = ${userId} and c.type = 'expense' and c.name = ${categoryName})
    from accounts a where a.user_id = ${userId} limit 1`);
}

/** Creates a budget for a named expense category straight in the database. */
export async function addBudgetFor(email: string, categoryName: string, amount: string, period: "weekly" | "monthly") {
  const userId = await userIdByEmail(email);
  await queryDb((sql) => sql`
    insert into budgets (user_id, category_id, amount, period)
    select ${userId}, c.id, ${amount}::numeric, ${period}::budget_period
    from categories c where c.user_id = ${userId} and c.type = 'expense' and c.name = ${categoryName}`);
}

/** Opens a custom dropdown (Account, Category) inside `scope` and picks the option with this name. */
export async function pickOption(scope: Page | Locator, label: string, option: string) {
  await scope.getByRole("combobox", { name: label }).click();
  await scope.getByRole("option", { name: option, exact: true }).click();
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Picks a `YYYY-MM-DD` date in a DateInput (the field is read-only, so it is chosen from the calendar). */
export async function pickDate(field: Locator, iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  await field.click();
  const calendar = field.page().locator(".react-datepicker");
  await calendar.locator("select.react-datepicker__year-select").selectOption(String(year));
  await calendar.locator("select.react-datepicker__month-select").selectOption({ label: MONTH_NAMES[month - 1] });
  await calendar.locator(`.react-datepicker__day--0${String(day).padStart(2, "0")}:not(.react-datepicker__day--outside-month)`).click();
}
