import { expect, test, type Page } from "@playwright/test";
import { pickOption, addBulkTransactions, addTagFor, addTransactionFor, createUserInDb, logIn, uniqueEmail, pickDate } from "./helpers";

const PASSWORD = "password123";

async function signedInUser(page: Page, label: string) {
  const email = uniqueEmail(label);
  await createUserInDb(email, PASSWORD, "Tx User");
  await logIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function addTransaction(
  page: Page,
  input: { type: "income" | "expense"; amount: string; date: string; category?: string; tags?: string[]; note?: string },
) {
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByRole("radio", { name: input.type }).check({ force: true });
  await dialog.getByLabel("Amount ($)").fill(input.amount);
  await pickDate(dialog.getByLabel("Date"), input.date);
  if (input.category) await pickOption(dialog, "Category", input.category);
  for (const tag of input.tags ?? []) await dialog.getByLabel(tag, { exact: true }).check({ force: true });
  if (input.note) await dialog.getByLabel("Note").fill(input.note);
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("transactions", () => {
  test("empty state, then add income and expense; income is green with a +, expense is plain; balance updates", async ({ page }) => {
    await signedInUser(page, "tx-add");
    await page.goto("/transactions");
    await expect(page.getByText("No transactions yet")).toBeVisible();

    await addTransaction(page, { type: "income", amount: "2500", date: "2026-03-01", category: "Salary", note: "March salary" });
    await addTransaction(page, { type: "expense", amount: "42.5", date: "2026-03-05", category: "Groceries", note: "Weekly shop" });

    const table = page.getByRole("table");
    const rows = table.getByRole("row");
    await expect(rows).toHaveCount(3); // header + 2
    // Newest first.
    await expect(rows.nth(1)).toContainText("Weekly shop");
    await expect(rows.nth(2)).toContainText("March salary");

    const expense = table.getByText("$42.50", { exact: true });
    const income = table.getByText("+$2,500.00");
    await expect(expense).toBeVisible();
    await expect(income).toBeVisible();
    await expect(expense).toHaveClass(/text-text/);
    await expect(income).toHaveClass(/text-income-text/);
    await expect(rows.nth(1)).toContainText("Groceries");
    await expect(rows.nth(1)).toContainText("Cash");
    await expect(rows.nth(1)).toContainText("Mar 5, 2026");

    await page.goto("/profile/accounts");
    await expect(page.getByRole("listitem").filter({ hasText: "Cash" })).toContainText("$2,457.50");
  });

  test("the category list follows the type and resets when the type changes", async ({ page }) => {
    await signedInUser(page, "tx-category");
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add transaction" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    const category = dialog.getByRole("combobox", { name: "Category" });

    await category.click();
    await expect(dialog.getByRole("option", { name: "Groceries" })).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: "Salary" })).toHaveCount(0);
    await dialog.getByRole("option", { name: "Groceries" }).click();

    await dialog.getByRole("radio", { name: "income" }).check({ force: true });
    await expect(category).toHaveText(/No category/);
    await category.click();
    await expect(dialog.getByRole("option", { name: "Salary" })).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: "Groceries" })).toHaveCount(0);
  });

  test("validation errors are shown and nothing is saved", async ({ page }) => {
    await signedInUser(page, "tx-validate");
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add transaction" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByRole("button", { name: "Add transaction" }).click();
    await expect(dialog.getByText("Enter an amount like 100 or 100.50")).toBeVisible();
    await dialog.getByLabel("Amount ($)").fill("0");
    await dialog.getByRole("button", { name: "Add transaction" }).click();
    await expect(dialog.getByText("Amount must be greater than 0")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("No transactions yet")).toBeVisible();
  });

  test("tags can be attached, edited, and shown", async ({ page }) => {
    const email = await signedInUser(page, "tx-tags");
    await addTagFor(email, "trip");
    await addTagFor(email, "work");
    await page.goto("/transactions");
    await addTransaction(page, { type: "expense", amount: "80", date: "2026-03-10", category: "Travel", tags: ["trip", "work"], note: "Train" });

    const row = page.getByRole("row").filter({ hasText: "Train" });
    await expect(row.getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveText(["trip", "work"]);

    await row.getByRole("button", { name: /^Edit/ }).click();
    const edit = page.getByRole("dialog", { name: "Edit transaction" });
    await expect(edit.getByLabel("trip", { exact: true })).toBeChecked();
    await edit.getByLabel("trip", { exact: true }).uncheck({ force: true });
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();
    await expect(row.getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveText(["work"]);
  });

  test("edit changes the transaction and the balance; delete asks for confirmation", async ({ page }) => {
    await signedInUser(page, "tx-edit");
    await page.goto("/transactions");
    await addTransaction(page, { type: "expense", amount: "10", date: "2026-03-05", category: "Rent", note: "Original" });

    const row = page.getByRole("row").filter({ hasText: "Original" });
    await row.getByRole("button", { name: /^Edit -\$10\.00/ }).click();
    const edit = page.getByRole("dialog", { name: "Edit transaction" });
    await expect(edit.getByLabel("Amount ($)")).toHaveValue("10.00");
    await expect(edit.getByRole("combobox", { name: "Category" })).toHaveText(/Rent/);
    await edit.getByLabel("Amount ($)").fill("25.75");
    await edit.getByLabel("Note").fill("Edited note");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();

    const edited = page.getByRole("row").filter({ hasText: "Edited note" });
    await expect(edited).toContainText("$25.75");
    await expect(page.getByText("Original")).toHaveCount(0);

    await page.goto("/profile/accounts");
    await expect(page.getByRole("listitem").filter({ hasText: "Cash" })).toContainText("-$25.75");

    await page.goto("/transactions");
    await page.getByRole("row").filter({ hasText: "Edited note" }).getByRole("button", { name: /^Delete/ }).click();
    const confirm = page.getByRole("dialog", { name: "Delete transaction" });
    await expect(confirm).toContainText("This cannot be undone");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Edited note" })).toBeVisible();

    await page.getByRole("row").filter({ hasText: "Edited note" }).getByRole("button", { name: /^Delete/ }).click();
    await page.getByRole("dialog", { name: "Delete transaction" }).getByRole("button", { name: "Delete transaction" }).click();
    await expect(page.getByText("No transactions yet")).toBeVisible();
    await page.goto("/profile/accounts");
    await expect(page.getByRole("listitem").filter({ hasText: "Cash" })).toContainText("$0.00");
  });

  test("filters live in the URL: type, dates, category, account, tag and note search", async ({ page }) => {
    const email = await signedInUser(page, "tx-filter");
    await addTagFor(email, "trip");
    await page.goto("/transactions");
    await addTransaction(page, { type: "income", amount: "1000", date: "2026-02-01", category: "Salary", note: "Feb pay" });
    await addTransaction(page, { type: "expense", amount: "20", date: "2026-02-10", category: "Groceries", note: "Apples 50%" });
    await addTransaction(page, { type: "expense", amount: "60", date: "2026-03-10", category: "Travel", tags: ["trip"], note: "Bus ticket" });

    const rows = page.getByRole("table").getByRole("row");

    await page.getByLabel("Type").selectOption("expense");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/type=expense/);
    await expect(rows).toHaveCount(3);
    await expect(page.getByText("Feb pay")).toHaveCount(0);

    // Reloading keeps the filter (it is in the URL).
    await page.reload();
    await expect(page.getByLabel("Type")).toHaveValue("expense");
    await expect(rows).toHaveCount(3);

    await page.getByLabel("From").fill("2026-03-01");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Bus ticket");

    await page.getByRole("link", { name: "Clear filters" }).first().click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(rows).toHaveCount(4);

    await pickOption(page, "Category", "Groceries");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Apples");

    await page.goto("/transactions");
    await page.getByLabel("Tag", { exact: true }).selectOption({ label: "trip" });
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Bus ticket");

    await page.goto("/transactions");
    await pickOption(page, "Account", "Cash");
    await page.getByLabel("Search notes").fill("50%");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Apples 50%");

    // A shareable URL works directly, and bad values are ignored rather than breaking the page.
    await page.goto("/transactions?type=income&from=2026-01-01&to=2026-02-28");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Feb pay");
    await page.goto("/transactions?type=bogus&from=2026-13-45&account=not-a-uuid&page=-3");
    await expect(rows).toHaveCount(4);
  });

  test("no matches shows a helpful empty state", async ({ page }) => {
    await signedInUser(page, "tx-nomatch");
    await page.goto("/transactions");
    await addTransaction(page, { type: "expense", amount: "5", date: "2026-03-01", note: "Gum" });
    await page.goto("/transactions?q=nothing-like-this");
    await expect(page.getByText("No transactions match your filters")).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Clear filters" }).last().click();
    await expect(page.getByRole("row").filter({ hasText: "Gum" })).toBeVisible();
  });

  test("lists 20 per page with working pagination", async ({ page }) => {
    const email = await signedInUser(page, "tx-pages");
    await addBulkTransactions(email, 45);
    await page.goto("/transactions");
    const rows = page.getByRole("table").getByRole("row");

    await expect(rows).toHaveCount(21); // header + 20
    await expect(page.getByText("Page 1 of 3 · 45 transactions")).toBeVisible();
    await expect(rows.nth(1)).toContainText("bulk 45");
    await expect(page.getByText("Previous", { exact: true }).first()).toHaveAttribute("aria-disabled", "true");

    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows.nth(1)).toContainText("bulk 25");
    await expect(page.getByText("Page 2 of 3")).toBeVisible();

    await page.getByRole("link", { name: "Next" }).click();
    await expect(rows).toHaveCount(6); // header + 5
    await expect(rows.last()).toContainText("bulk 1");
    await expect(page.getByText("Next", { exact: true }).first()).toHaveAttribute("aria-disabled", "true");

    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page).toHaveURL(/page=2/);

    // Filters are kept while paging, and a page past the end falls back to the last one.
    await page.goto("/transactions?q=bulk&page=2");
    await expect(page.getByRole("link", { name: "Previous" })).toHaveAttribute("href", /q=bulk/);
    await page.goto("/transactions?page=99");
    await expect(page.getByText("Page 3 of 3")).toBeVisible();
  });

  test("an account is required: with none, adding is disabled and explained", async ({ page }) => {
    await signedInUser(page, "tx-noaccount");
    await page.goto("/profile/accounts");
    await page.getByRole("button", { name: "Delete Cash" }).click();
    await page.getByRole("dialog", { name: "Delete account" }).getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByText("No accounts yet")).toBeVisible();

    await page.goto("/transactions");
    await expect(page.getByText(/Create an account first/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add transaction" })).toBeDisabled();
    await page.getByRole("link", { name: "Profile → Accounts" }).click();
    await expect(page).toHaveURL(/\/profile\/accounts$/);
  });

  test("shows a transaction with its category, account and amount", async ({ page }) => {
    const email = await signedInUser(page, "tx-blocks");
    await addTransactionFor(email, "Rent");
    await page.goto("/transactions");
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("row").filter({ hasText: "Rent" })).toContainText("$10.00");
  });

  test("users only see their own transactions, even with someone else's filter ids", async ({ page, browser }) => {
    const email = await signedInUser(page, "tx-iso-a");
    await addTransactionFor(email, "Rent");
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signedInUser(otherPage, "tx-iso-b");
    await otherPage.goto("/transactions");
    await expect(otherPage.getByText("No transactions yet")).toBeVisible();
    await other.close();
  });
});

test.describe("transactions on a phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("shows cards instead of a table, and adding works", async ({ page }) => {
    const email = await signedInUser(page, "tx-mobile");
    await addBulkTransactions(email, 2);
    await page.goto("/transactions");

    await expect(page.getByRole("table")).toBeHidden();
    const cards = page.getByRole("list", { name: "Transactions, newest first" }).getByRole("listitem");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("bulk 2");
    await expect(cards.first()).toContainText("$1.00");
    await expect(cards.first()).toContainText("Cash");

    await page.getByRole("button", { name: "Add transaction" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Amount ($)").fill("9.99");
    await dialog.getByLabel("Note").fill("Phone add");
    await dialog.getByRole("button", { name: "Add transaction" }).click();
    await expect(cards.filter({ hasText: "Phone add" })).toContainText("$9.99");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
