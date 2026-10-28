import { expect, test } from "@playwright/test";
import { createUserInDb, logIn, queryDb, uniqueEmail, userIdByEmail } from "./helpers";

const PASSWORD = "password123";

/** The 5th of the month `monthsAgo` months back, as `YYYY-MM-DD`. */
function fifthOfMonth(monthsAgo: number) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - monthsAgo, 5));
  return date.toISOString().slice(0, 10);
}

test.describe("forecast report", () => {
  test("projects spending per category and follows the category filter", async ({ page }) => {
    const email = uniqueEmail("forecast");
    await createUserInDb(email, PASSWORD);
    const userId = await userIdByEmail(email);
    // Four complete months: Rent is flat, Groceries is rising.
    const groceries = [100, 100, 130, 130];
    for (let index = 0; index < 4; index++) {
      for (const [category, amount] of [["Rent", 1000], ["Groceries", groceries[index]]] as const) {
        await queryDb(
          (sql) => sql`
            insert into transactions (user_id, type, amount, date, account_id, category_id)
            select ${userId}, 'expense', ${amount}, ${fifthOfMonth(4 - index)}::date, a.id,
                   (select c.id from categories c where c.user_id = ${userId} and c.type = 'expense' and c.name = ${category})
            from accounts a where a.user_id = ${userId} limit 1`,
        );
      }
    }

    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    // It is part of the Reports navigation.
    await page.goto("/reports/cash-flow");
    await page.getByRole("link", { name: "Forecast" }).first().click();
    await expect(page).toHaveURL(/\/reports\/forecast/);

    // Rent is stable at 1,000; Groceries average 115, up 30% -> projected 149.50.
    const table = page.getByRole("table");
    await expect(page.getByText("Projected spending (next 3 months)")).toBeVisible();
    await expect(page.getByRole("img", { name: /Actual and projected spending per month/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Rent/ })).toContainText("$1,000.00");
    await expect(table.getByRole("row", { name: /Groceries/ })).toContainText("$149.50");
    await expect(table.getByRole("row", { name: /Groceries/ })).toContainText("↑ +30.0%");
    await expect(page.getByText("Year-end projection")).toBeVisible();

    // Filter by category.
    await page.goto("/reports/forecast?category=expense:Groceries");
    await expect(table.getByRole("row", { name: /Groceries/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Rent/ })).toHaveCount(0);
  });

  test("explains when there is nothing to forecast", async ({ page }) => {
    const email = uniqueEmail("forecast-empty");
    await createUserInDb(email, PASSWORD);
    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/reports/forecast");
    await expect(page.getByText("No expenses to forecast")).toBeVisible();
  });
});
