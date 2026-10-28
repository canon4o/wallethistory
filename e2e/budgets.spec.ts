import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addExpenseFor,
  pickOption,
  createUserInDb,
  daysFromToday,
  logIn,
  queryDb,
  todayUTC,
  uniqueEmail,
  userIdByEmail,
  pickDate,
} from "./helpers";

const PASSWORD = "password123";

async function signedInUser(page: Page, label: string) {
  const email = uniqueEmail(label);
  await createUserInDb(email, PASSWORD, "Budget User");
  await logIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function addBudget(page: Page, input: { category: string; limit: string; period?: "Weekly" | "Monthly" }) {
  await page.getByRole("button", { name: "Add budget" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add budget" });
  await pickOption(dialog, "Category", input.category);
  if (input.period) await dialog.getByLabel("Period").selectOption({ label: input.period });
  await dialog.getByLabel("Limit ($)").fill(input.limit);
  await dialog.getByRole("button", { name: "Add budget" }).click();
  await expect(dialog).toBeHidden();
}

/** The value under a label ("Spent", "Limit", "Remaining" or "Over by") in a budget row. */
const stat = (row: Locator, label: string) =>
  row.locator("dl > div").filter({ hasText: new RegExp(`^${label}`) }).locator("dd");

const budgetRow = (page: Page, category: string, period: "Weekly" | "Monthly") =>
  page.getByRole("listitem").filter({ hasText: category }).filter({ hasText: period });

test.describe("budgets", () => {
  test("empty state, then create a budget and watch its progress change as expenses are added", async ({ page }) => {
    await signedInUser(page, "bud-flow");
    await page.goto("/budgets");
    await expect(page.getByText("No budgets yet")).toBeVisible();

    await addBudget(page, { category: "Groceries", limit: "100" });
    const row = budgetRow(page, "Groceries", "Monthly");
    await expect(row).toContainText("Monthly");
    await expect(stat(row, "Spent")).toHaveText("$0.00");
    await expect(stat(row, "Limit")).toHaveText("$100.00");
    await expect(stat(row, "Remaining")).toHaveText("$100.00");
    await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    // Add a matching expense on the transactions page.
    const addExpense = async (amount: string) => {
      await page.goto("/transactions");
      await page.getByRole("button", { name: "Add transaction" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add transaction" });
      await dialog.getByLabel("Amount ($)").fill(amount);
      await pickDate(dialog.getByLabel("Date"), todayUTC());
      await pickOption(dialog, "Category", "Groceries");
      await dialog.getByRole("button", { name: "Add transaction" }).click();
      await expect(dialog).toBeHidden();
    };

    await addExpense("30");
    await page.goto("/budgets");
    await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
    await expect(stat(row, "Spent")).toHaveText("$30.00");
    await expect(stat(row, "Remaining")).toHaveText("$70.00");
    await expect(row.getByRole("progressbar").locator("div")).toHaveClass(/bg-primary/);

    await addExpense("80");
    await page.goto("/budgets");
    await expect(stat(row, "Over by")).toHaveText("$10.00");
    await expect(stat(row, "Spent")).toHaveText("$110.00");
    await expect(row.getByText("Remaining")).toHaveCount(0);
    await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    await expect(row.getByRole("progressbar").locator("div")).toHaveClass(/bg-expense/);
  });

  test("only counts this period's expenses of the category: weekly vs monthly, past months, other categories", async ({ page }) => {
    const email = await signedInUser(page, "bud-windows");
    await addExpenseFor(email, "Groceries", "40", todayUTC()); // counts for both
    await addExpenseFor(email, "Groceries", "15", daysFromToday(-40)); // a previous month: counts for neither
    await addExpenseFor(email, "Rent", "500", todayUTC()); // another category

    await page.goto("/budgets");
    await addBudget(page, { category: "Groceries", limit: "200", period: "Monthly" });
    await addBudget(page, { category: "Groceries", limit: "50", period: "Weekly" });

    const monthly = budgetRow(page, "Groceries", "Monthly");
    const weekly = budgetRow(page, "Groceries", "Weekly");
    await expect(monthly.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20"); // 40 / 200
    await expect(monthly.getByText("$40.00")).toBeVisible();
    await expect(weekly.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "80"); // 40 / 50
    await expect(weekly.getByText("$10.00")).toBeVisible();

    // The windows are shown: a month name, and a Monday-to-Sunday range.
    await expect(monthly).toContainText(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/);
    await expect(weekly).toContainText(/\w{3} \d{1,2}, \d{4} – \w{3} \d{1,2}, \d{4}/);
  });

  test("the category list only offers expense categories", async ({ page }) => {
    await signedInUser(page, "bud-categories");
    await page.goto("/budgets");
    await page.getByRole("button", { name: "Add budget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add budget" });
    await dialog.getByRole("combobox", { name: "Category" }).click();
    await expect(dialog.getByRole("option", { name: "Groceries" })).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: "Rent" })).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: "Salary" })).toHaveCount(0);
    await expect(dialog.getByRole("option", { name: "Gifts" })).toHaveCount(0);
  });

  test("a second budget for the same category and period is refused with a clear message", async ({ page }) => {
    await signedInUser(page, "bud-dup");
    await page.goto("/budgets");
    await addBudget(page, { category: "Rent", limit: "1000", period: "Monthly" });

    await page.getByRole("button", { name: "Add budget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add budget" });
    await pickOption(dialog, "Category", "Rent");
    await dialog.getByLabel("Period").selectOption({ label: "Monthly" });
    await dialog.getByLabel("Limit ($)").fill("1500");
    await dialog.getByRole("button", { name: "Add budget" }).click();
    await expect(dialog.getByText("A monthly budget for this category already exists").first()).toBeVisible();

    // The same category with the other period is fine.
    await dialog.getByLabel("Period").selectOption({ label: "Weekly" });
    await dialog.getByRole("button", { name: "Add budget" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("listitem").filter({ hasText: "Rent" })).toHaveCount(2);
  });

  test("validation errors are shown", async ({ page }) => {
    await signedInUser(page, "bud-validate");
    await page.goto("/budgets");
    await page.getByRole("button", { name: "Add budget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add budget" });
    await dialog.getByRole("button", { name: "Add budget" }).click();
    await expect(dialog.getByText("Enter an amount like 100 or 100.50")).toBeVisible();
    await dialog.getByLabel("Limit ($)").fill("0");
    await dialog.getByRole("button", { name: "Add budget" }).click();
    await expect(dialog.getByText("Amount must be greater than 0")).toBeVisible();
  });

  test("edit a budget, then delete it after confirming", async ({ page }) => {
    await signedInUser(page, "bud-edit");
    await page.goto("/budgets");
    await addBudget(page, { category: "Food & Dining", limit: "300", period: "Monthly" });

    await page.getByRole("button", { name: "Edit monthly budget for Food & Dining" }).click();
    const edit = page.getByRole("dialog", { name: "Edit budget" });
    await expect(edit.getByLabel("Limit ($)")).toHaveValue("300.00");
    await pickOption(edit, "Category", "Transport");
    await edit.getByLabel("Period").selectOption({ label: "Weekly" });
    await edit.getByLabel("Limit ($)").fill("60");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();

    const row = budgetRow(page, "Transport", "Weekly");
    await expect(row).toContainText("$60.00");
    await expect(page.getByRole("listitem").filter({ hasText: "Food & Dining" })).toHaveCount(0);

    await page.getByRole("button", { name: "Delete weekly budget for Transport" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete budget" });
    await expect(confirm).toContainText("Your transactions are not affected");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(row).toBeVisible();
    await page.getByRole("button", { name: "Delete weekly budget for Transport" }).click();
    await page.getByRole("dialog", { name: "Delete budget" }).getByRole("button", { name: "Delete budget" }).click();
    await expect(page.getByText("No budgets yet")).toBeVisible();
  });

  test("budgets with the most usage are listed first", async ({ page }) => {
    const email = await signedInUser(page, "bud-order");
    await addExpenseFor(email, "Rent", "900", todayUTC());
    await addExpenseFor(email, "Groceries", "10", todayUTC());
    await page.goto("/budgets");
    await addBudget(page, { category: "Groceries", limit: "100" });
    await addBudget(page, { category: "Rent", limit: "1000" });
    const items = page.getByRole("main").getByRole("listitem");
    await expect(items.first()).toContainText("Rent");
    await expect(items.nth(1)).toContainText("Groceries");
  });

  test("deleting a category removes its budgets", async ({ page }) => {
    await signedInUser(page, "bud-cascade");
    await page.goto("/budgets");
    await addBudget(page, { category: "Travel", limit: "400" });
    await expect(budgetRow(page, "Travel", "Monthly")).toBeVisible();

    await page.goto("/profile/categories");
    await page.getByRole("button", { name: "Delete Travel" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete category" });
    await expect(dialog).toContainText("Budgets that use it are deleted with it");
    await dialog.getByRole("button", { name: "Delete category" }).click();
    await expect(page.getByRole("button", { name: "Delete Travel" })).toHaveCount(0);

    await page.goto("/budgets");
    await expect(page.getByText("No budgets yet")).toBeVisible();
  });

  test("without expense categories there is nothing to budget and the page says why", async ({ page }) => {
    const email = await signedInUser(page, "bud-nocats");
    const userId = await userIdByEmail(email);
    await queryDb((sql) => sql`delete from categories where user_id = ${userId} and type = 'expense'`);
    await page.goto("/budgets");
    await expect(page.getByText(/Budgets need an expense category/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add budget" })).toHaveCount(0);
  });

  test("users only see their own budgets", async ({ page, browser }) => {
    await signedInUser(page, "bud-iso-a");
    await page.goto("/budgets");
    await addBudget(page, { category: "Groceries", limit: "123" });

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signedInUser(otherPage, "bud-iso-b");
    await otherPage.goto("/budgets");
    await expect(otherPage.getByText("No budgets yet")).toBeVisible();
    await expect(otherPage.getByText("$123.00")).toHaveCount(0);
    await other.close();
  });
});

test.describe("budgets on a phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the list fits the screen and adding works", async ({ page }) => {
    const email = await signedInUser(page, "bud-mobile");
    await addExpenseFor(email, "Groceries", "25", todayUTC());
    await page.goto("/budgets");
    await addBudget(page, { category: "Groceries", limit: "50" });
    const row = budgetRow(page, "Groceries", "Monthly");
    await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    await expect(row.getByText("$25.00").first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
