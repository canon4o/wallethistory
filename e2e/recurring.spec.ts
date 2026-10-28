import { expect, test } from "@playwright/test";
import { createUserInDb, logIn, queryDb, uniqueEmail, pickDate } from "./helpers";

const PASSWORD = "password123";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString("en-CA");
}

test.describe("recurring transactions", () => {
  test("a rule with a past start date creates its missed entries and shows them in History", async ({ page }) => {
    const email = uniqueEmail("recurring");
    await createUserInDb(email, PASSWORD);
    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add transaction" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Amount ($)").fill("15");
    await pickDate(dialog.getByLabel("Date"), daysAgo(2));
    await dialog.getByRole("checkbox", { name: "Repeat this automatically" }).check();
    await dialog.getByLabel("Frequency").selectOption("daily");
    await dialog.getByRole("button", { name: "Add recurring transaction" }).click();
    await expect(dialog).toBeHidden();

    // Three daily entries (two days ago, yesterday, today) appear, each marked as recurring.
    await page.reload();
    await expect(page.getByRole("table").getByText("Recurring")).toHaveCount(3);
    const rows = await queryDb<{ count: number }>(
      (sql) => sql`select count(*)::int as count from transactions t join users u on u.id = t.user_id where u.email = ${email}`,
    );
    expect(rows[0].count).toBe(3);

    // The rule is listed under Profile -> Recurring; pausing it and deleting it keeps the entries.
    await page.goto("/profile/recurring");
    await expect(page.getByRole("cell", { name: "Every day", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Pause/ }).click();
    await expect(page.getByText("Paused", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Delete/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete recurring" }).click();
    await expect(page.getByText(/Nothing repeats yet/)).toBeVisible();

    await page.goto("/transactions");
    await expect(page.getByRole("table").getByText("Recurring")).toHaveCount(3);
  });
});
