import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addBudgetFor,
  addBulkTransactions,
  addExpenseFor,
  pickOption,
  createUserInDb,
  daysFromToday,
  logIn,
  todayUTC,
  uniqueEmail,
  pickDate,
} from "./helpers";

const PASSWORD = "password123";

async function signedInUser(page: Page, label: string) {
  const email = uniqueEmail(label);
  await createUserInDb(email, PASSWORD, "Dash User");
  await logIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

/**
 * The value under a label in the summary cards, e.g. "Total balance". A card also has <dd>s for
 * the change line and the sparkline, so only the one right after the label is the value.
 */
const summary = (page: Page, label: string): Locator =>
  page.getByLabel("Summary").locator("div").filter({ has: page.getByText(label, { exact: true }) }).locator("dt + dd");

test.describe("dashboard", () => {
  test("a new user sees zeros and helpful empty states", async ({ page }) => {
    await signedInUser(page, "dash-empty");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(summary(page, "Total balance")).toHaveText("$0.00");
    await expect(summary(page, "Income this month")).toHaveText("$0.00");
    await expect(summary(page, "Expense this month")).toHaveText("$0.00");
    await expect(summary(page, "Net this month")).toHaveText("$0.00");

    const accounts = page.getByRole("region", { name: "Accounts" });
    await expect(accounts.getByRole("listitem")).toHaveCount(1); // the default Cash account
    await expect(page.getByRole("region", { name: "Budgets" }).getByText("No budgets yet.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent transactions" }).getByText("No transactions yet.")).toBeVisible();

    await page.getByRole("link", { name: "Set a budget" }).click();
    await expect(page).toHaveURL(/\/budgets$/);
  });

  test("create account, category and transactions, then see them on the dashboard and in the account balance", async ({ page }) => {
    await signedInUser(page, "dash-flow");

    // Account
    await page.goto("/profile/accounts");
    await page.getByRole("button", { name: "Add account" }).first().click();
    const accountDialog = page.getByRole("dialog", { name: "Add account" });
    await accountDialog.getByLabel("Name").fill("Wallet");
    await accountDialog.getByLabel("Type").selectOption("cash");
    await accountDialog.getByLabel("Initial balance ($)").fill("100");
    await accountDialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Wallet" })).toContainText("$100.00");

    // Category
    await page.goto("/profile/categories");
    await page.getByRole("region", { name: "Expense categories" }).getByRole("button", { name: "Add category" }).click();
    const categoryDialog = page.getByRole("dialog", { name: "Add category" });
    await categoryDialog.getByLabel("Name").fill("Coffee");
    await categoryDialog.locator('label[title="coffee"]').click();
    await categoryDialog.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Coffee" })).toBeVisible();

    // Transactions: one expense in the new category, one income
    await page.goto("/transactions");
    const add = async (type: "income" | "expense", amount: string, category: string, note: string) => {
      await page.getByRole("button", { name: "Add transaction" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add transaction" });
      await dialog.getByRole("radio", { name: type }).check({ force: true });
      await dialog.getByLabel("Amount ($)").fill(amount);
      await pickDate(dialog.getByLabel("Date"), todayUTC());
      await pickOption(dialog, "Account", "Wallet");
      await pickOption(dialog, "Category", category);
      await dialog.getByLabel("Note").fill(note);
      await dialog.getByRole("button", { name: "Add transaction" }).click();
      await expect(dialog).toBeHidden();
    };
    await add("expense", "12.5", "Coffee", "Morning latte");
    await add("income", "200", "Salary", "Side gig");

    // Dashboard
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(summary(page, "Total balance")).toHaveText("$287.50"); // 100 + 200 - 12.50
    await expect(summary(page, "Income this month")).toHaveText("$200.00");
    await expect(summary(page, "Expense this month")).toHaveText("$12.50");
    await expect(summary(page, "Net this month")).toHaveText("+$187.50");

    const accounts = page.getByRole("region", { name: "Accounts" });
    await expect(accounts.getByRole("listitem").filter({ hasText: "Wallet" })).toContainText("$287.50");
    // The default Cash account was created first, so it is listed first.
    await expect(accounts.getByRole("listitem").first()).toContainText("$0.00");

    const recent = page.getByRole("region", { name: "Recent transactions" }).getByRole("listitem");
    await expect(recent).toHaveCount(2);
    await expect(recent.first()).toContainText("Side gig");
    await expect(recent.first()).toContainText("+$200.00");
    await expect(recent.nth(1)).toContainText("Morning latte");
    await expect(recent.nth(1)).toContainText("$12.50");
    await expect(recent.nth(1)).toContainText("Coffee");

    // The account balance on the Accounts page matches.
    await page.goto("/profile/accounts");
    await expect(page.getByRole("listitem").filter({ hasText: "Wallet" })).toContainText("$287.50");
  });

  test("budget progress is shown with the usage bar, red when over the limit", async ({ page }) => {
    const email = await signedInUser(page, "dash-budgets");
    await addExpenseFor(email, "Groceries", "40", todayUTC());
    await addExpenseFor(email, "Rent", "1100", todayUTC());
    await addBudgetFor(email, "Groceries", "200", "monthly");
    await addBudgetFor(email, "Rent", "1000", "monthly");
    await page.goto("/dashboard");

    const budgets = page.getByRole("region", { name: "Budgets" }).getByRole("listitem");
    await expect(budgets).toHaveCount(2);
    // Most used first: Rent (110%) then Groceries (20%).
    await expect(budgets.first()).toContainText("Rent");
    await expect(budgets.first()).toContainText("$1,100.00 of $1,000.00 · over by $100.00");
    await expect(budgets.first().getByRole("progressbar").locator("div")).toHaveClass(/bg-expense/);
    await expect(budgets.nth(1)).toContainText("Groceries");
    await expect(budgets.nth(1)).toContainText("$40.00 of $200.00");
    await expect(budgets.nth(1).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
    await expect(budgets.nth(1).getByRole("progressbar").locator("div")).toHaveClass(/bg-primary/);

    await page.getByRole("link", { name: "All budgets" }).click();
    await expect(page).toHaveURL(/\/budgets$/);
  });

  test("shows only the 5 newest transactions and links to all of them", async ({ page }) => {
    const email = await signedInUser(page, "dash-recent");
    await addBulkTransactions(email, 7); // "bulk 7" is the newest
    await page.goto("/dashboard");

    const recent = page.getByRole("region", { name: "Recent transactions" }).getByRole("listitem");
    await expect(recent).toHaveCount(5);
    await expect(recent.first()).toContainText("bulk 7");
    await expect(recent.last()).toContainText("bulk 3");
    await expect(page.getByText("bulk 2", { exact: true })).toHaveCount(0);

    await page.getByRole("link", { name: "View all" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(8); // header + 7
  });

  test("this month's income and expense exclude other months, but the balance counts everything", async ({ page }) => {
    const email = await signedInUser(page, "dash-months");
    await addExpenseFor(email, "Rent", "15", daysFromToday(-40)); // a previous month
    await addExpenseFor(email, "Rent", "5", todayUTC());
    await page.goto("/dashboard");

    await expect(summary(page, "Expense this month")).toHaveText("$5.00");
    await expect(summary(page, "Income this month")).toHaveText("$0.00");
    await expect(summary(page, "Net this month")).toHaveText("-$5.00");
    await expect(summary(page, "Total balance")).toHaveText("-$20.00");
    await expect(summary(page, "Net this month")).toHaveClass(/text-expense-text/);
    await expect(page.getByRole("region", { name: "Accounts" }).getByRole("listitem")).toContainText("-$20.00");
  });

  test("users only see their own numbers", async ({ page, browser }) => {
    const email = await signedInUser(page, "dash-iso-a");
    await addExpenseFor(email, "Rent", "321", todayUTC());
    await page.goto("/dashboard");
    await expect(summary(page, "Expense this month")).toHaveText("$321.00");

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signedInUser(otherPage, "dash-iso-b");
    await expect(summary(otherPage, "Expense this month")).toHaveText("$0.00");
    await expect(otherPage.getByText("$321.00")).toHaveCount(0);
    await other.close();
  });
});

test.describe("dashboard on a phone", () => {
  test("cards stack and nothing overflows the screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const email = await signedInUser(page, "dash-mobile");
    await addExpenseFor(email, "Groceries", "25", todayUTC());
    await addBudgetFor(email, "Groceries", "50", "monthly");
    await page.goto("/dashboard");

    await expect(summary(page, "Total balance")).toHaveText("-$25.00");
    await expect(page.getByRole("region", { name: "Budgets" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent transactions" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
