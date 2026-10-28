import { expect, test, type Page } from "@playwright/test";
import { addTransactionFor, createUserInDb, logIn, queryDb, uniqueEmail, userIdByEmail } from "./helpers";

const PASSWORD = "password123";

async function signedInUser(page: Page, label: string, name = "E2E User") {
  const email = uniqueEmail(label);
  await createUserInDb(email, PASSWORD, name);
  await logIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test.describe("settings", () => {
  test("shows the profile, lets you rename yourself, and keeps the email read-only", async ({ page }) => {
    const email = await signedInUser(page, "settings", "Old Name");
    await page.goto("/profile/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    const emailField = page.getByLabel("Email");
    await expect(emailField).toHaveValue(email);
    await expect(emailField).toHaveAttribute("readonly", "");

    await page.getByLabel("Name").fill("New Name");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await expect(page.locator("aside").getByText("New Name", { exact: true })).toBeVisible();

    await page.getByLabel("Name").fill("");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Name is required")).toBeVisible();
  });

  test("changes the password: wrong current password is refused, then the new one works", async ({ page, browser }) => {
    const email = await signedInUser(page, "password");
    // A second device that must be signed out by the change.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await logIn(otherPage, email, PASSWORD);
    await expect(otherPage).toHaveURL(/\/dashboard$/);

    await page.goto("/profile/settings");
    await page.getByLabel("Current password").fill("wrong-password");
    await page.getByLabel("New password", { exact: true }).fill("brand-new-pass-1");
    await page.getByLabel("Confirm new password").fill("brand-new-pass-1");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That password is not correct.").first()).toBeVisible();

    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed. Your other devices have been signed out.")).toBeVisible();

    // This device stays signed in; the other one is signed out.
    await page.goto("/profile/accounts");
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await otherPage.goto("/dashboard");
    await expect(otherPage).toHaveURL(/\/login$/);
    await otherContext.close();

    await page.locator("aside").getByRole("button", { name: "Log out" }).click();
    await logIn(page, email, PASSWORD);
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await logIn(page, email, "brand-new-pass-1");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("deleting the account needs the password and removes all data", async ({ page }) => {
    const email = await signedInUser(page, "delete");
    const userId = await userIdByEmail(email);
    await addTransactionFor(email, "Rent");

    await page.goto("/profile/settings");
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account" });
    await expect(dialog.getByText(/permanently deletes your account and all of your accounts, categories, tags, transactions, and budgets/)).toBeVisible();

    await dialog.getByLabel("Enter your password to confirm").fill("wrong-password");
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(dialog.getByText("That password is not correct.").first()).toBeVisible();
    expect(await queryDb((sql) => sql`select 1 from users where id = ${userId}`)).toHaveLength(1);

    await dialog.getByLabel("Enter your password to confirm").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/login$/);

    const counts = await queryDb<{ n: number }>((sql) => sql`
      select (
        (select count(*) from users where id = ${userId}) +
        (select count(*) from accounts where user_id = ${userId}) +
        (select count(*) from categories where user_id = ${userId}) +
        (select count(*) from transactions where user_id = ${userId}) +
        (select count(*) from sessions where user_id = ${userId})
      )::int as n`);
    expect(counts[0].n).toBe(0);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await logIn(page, email, PASSWORD);
    await expect(page.getByText("Invalid email or password")).toBeVisible();
  });
});

test.describe("accounts", () => {
  test("add, edit, and delete an account with a calculated balance", async ({ page }) => {
    await signedInUser(page, "accounts");
    await page.goto("/profile/accounts");

    const cash = page.getByRole("listitem").filter({ hasText: "Cash" });
    await expect(cash).toContainText("$0.00");

    await page.getByRole("button", { name: "Add account" }).click();
    const add = page.getByRole("dialog", { name: "Add account" });
    await add.getByRole("button", { name: "Add account" }).click();
    await expect(add.getByText("Name is required")).toBeVisible();
    await add.getByLabel("Name").fill("Rainy day");
    await add.getByLabel("Type").selectOption("savings");
    await add.getByLabel("Initial balance ($)").fill("1250.5");
    await add.getByRole("button", { name: "Add account" }).click();

    const row = page.getByRole("listitem").filter({ hasText: "Rainy day" });
    await expect(row).toContainText("Savings");
    await expect(row).toContainText("$1,250.50");

    await row.getByRole("button", { name: "Edit Rainy day" }).click();
    const edit = page.getByRole("dialog", { name: "Edit account" });
    await edit.getByLabel("Name").fill("Emergency fund");
    await edit.getByLabel("Initial balance ($)").fill("2000");
    await edit.getByRole("button", { name: "Save changes" }).click();
    const renamed = page.getByRole("listitem").filter({ hasText: "Emergency fund" });
    await expect(renamed).toContainText("$2,000.00");
    await expect(page.getByText("Rainy day")).toHaveCount(0);

    await renamed.getByRole("button", { name: "Delete Emergency fund" }).click();
    await page.getByRole("dialog", { name: "Delete account" }).getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByText("Emergency fund")).toHaveCount(0);
  });

  test("an account with transactions cannot be deleted and the balance reflects them", async ({ page }) => {
    const email = await signedInUser(page, "inuse");
    await addTransactionFor(email, "Rent");
    await page.goto("/profile/accounts");

    const cash = page.getByRole("listitem").filter({ hasText: "Cash" });
    await expect(cash).toContainText("-$10.00");
    await cash.getByRole("button", { name: "Delete Cash" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account" });
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(dialog.getByText("This account has transactions.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(cash).toBeVisible();
  });

  test("shows an empty state with an add button when there are no accounts", async ({ page }) => {
    await signedInUser(page, "noaccounts");
    await page.goto("/profile/accounts");
    await page.getByRole("button", { name: "Delete Cash" }).click();
    await page.getByRole("dialog", { name: "Delete account" }).getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByText("No accounts yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add account" })).toBeVisible();
  });
});

test.describe("categories", () => {
  test("lists default categories grouped by type with icons", async ({ page }) => {
    await signedInUser(page, "catlist");
    await page.goto("/profile/categories");
    const expense = page.getByRole("region", { name: "Expense categories" });
    const income = page.getByRole("region", { name: "Income categories" });
    await expect(expense.getByRole("listitem")).toHaveCount(11);
    await expect(income.getByRole("listitem")).toHaveCount(5);
    await expect(expense.getByRole("listitem").filter({ hasText: "Groceries" }).locator("svg").first()).toBeVisible();
    await expect(income.getByText("Salary")).toBeVisible();
  });

  test("create with icon and color, edit (type is locked), duplicate error, delete", async ({ page }) => {
    await signedInUser(page, "catcrud");
    await page.goto("/profile/categories");

    await page.getByRole("region", { name: "Expense categories" }).getByRole("button", { name: "Add category" }).click();
    const add = page.getByRole("dialog", { name: "Add category" });
    await expect(add.getByLabel("expense")).toBeChecked();
    await add.getByLabel("Name").fill("Pets");
    await add.locator('label[title="paw-print"]').click();
    await add.locator('label:has(input[value="#8e6bbf"])').click();
    await add.getByRole("button", { name: "Add category" }).click();

    const expense = page.getByRole("region", { name: "Expense categories" });
    const pets = expense.getByRole("listitem").filter({ hasText: "Pets" });
    await expect(pets).toBeVisible();
    await expect(pets.locator("span[style]").first()).toHaveCSS("background-color", "rgb(142, 107, 191)");

    // Duplicate name (any case) in the same type is refused with a clear message.
    await page.getByRole("region", { name: "Expense categories" }).getByRole("button", { name: "Add category" }).click();
    const dup = page.getByRole("dialog", { name: "Add category" });
    await dup.getByLabel("Name").fill("pets");
    await dup.getByRole("button", { name: "Add category" }).click();
    await expect(dup.getByText("A category with this name already exists for this type.").first()).toBeVisible();
    await dup.getByRole("button", { name: "Cancel" }).click();

    // The same name is fine as an income category.
    await page.getByRole("region", { name: "Income categories" }).getByRole("button", { name: "Add category" }).click();
    const income = page.getByRole("dialog", { name: "Add category" });
    await expect(income.getByLabel("income")).toBeChecked();
    await income.getByLabel("Name").fill("Pets");
    await income.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByRole("region", { name: "Income categories" }).getByText("Pets")).toBeVisible();

    // Editing: the type cannot be changed.
    await pets.getByRole("button", { name: "Edit Pets" }).click();
    const edit = page.getByRole("dialog", { name: "Edit category" });
    await expect(edit.getByText("The type cannot be changed after creation.")).toBeVisible();
    await expect(edit.getByRole("radio", { name: "income" })).toHaveCount(0);
    await edit.getByLabel("Name").fill("Animals");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(expense.getByText("Animals")).toBeVisible();

    await expense.getByRole("button", { name: "Delete Animals" }).click();
    await page.getByRole("dialog", { name: "Delete category" }).getByRole("button", { name: "Delete category" }).click();
    await expect(expense.getByText("Animals")).toHaveCount(0);
  });

  test("a category used by transactions cannot be deleted", async ({ page }) => {
    const email = await signedInUser(page, "catinuse");
    await addTransactionFor(email, "Rent");
    await page.goto("/profile/categories");
    await page.getByRole("button", { name: "Delete Rent" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete category" });
    await dialog.getByRole("button", { name: "Delete category" }).click();
    await expect(dialog.getByText("This category is used by transactions.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Rent", { exact: true })).toBeVisible();
  });
});

test.describe("tags", () => {
  test("empty state, then add, duplicate error, rename, delete", async ({ page }) => {
    await signedInUser(page, "tags");
    await page.goto("/profile/tags");
    await expect(page.getByText("No tags yet")).toBeVisible();

    await page.getByRole("button", { name: "Add tag" }).click();
    const add = page.getByRole("dialog", { name: "Add tag" });
    await add.getByLabel("Name").fill("vacation");
    await add.getByRole("button", { name: "Add tag" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "vacation" })).toBeVisible();

    await page.getByRole("button", { name: "Add tag" }).click();
    const dup = page.getByRole("dialog", { name: "Add tag" });
    await dup.getByLabel("Name").fill("Vacation");
    await dup.getByRole("button", { name: "Add tag" }).click();
    await expect(dup.getByText("A tag with this name already exists.").first()).toBeVisible();
    await dup.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Edit vacation" }).click();
    const edit = page.getByRole("dialog", { name: "Edit tag" });
    await edit.getByLabel("Name").fill("holiday");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "holiday" })).toBeVisible();

    await page.getByRole("button", { name: "Delete holiday" }).click();
    await page.getByRole("dialog", { name: "Delete tag" }).getByRole("button", { name: "Delete tag" }).click();
    await expect(page.getByText("No tags yet")).toBeVisible();
  });
});

test.describe("isolation", () => {
  test("users only ever see their own accounts, categories, and tags", async ({ page, browser }) => {
    await signedInUser(page, "iso-a");
    await page.goto("/profile/tags");
    await page.getByRole("button", { name: "Add tag" }).click();
    await page.getByRole("dialog", { name: "Add tag" }).getByLabel("Name").fill("only-for-a");
    await page.getByRole("dialog", { name: "Add tag" }).getByRole("button", { name: "Add tag" }).click();
    await expect(page.getByText("only-for-a")).toBeVisible();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signedInUser(otherPage, "iso-b");
    await otherPage.goto("/profile/tags");
    await expect(otherPage.getByText("No tags yet")).toBeVisible();
    await expect(otherPage.getByText("only-for-a")).toHaveCount(0);
    await other.close();
  });
});
