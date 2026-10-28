import { expect, test, type Page } from "@playwright/test";
import { addBudgetFor, addExpenseFor, createUserInDb, logIn, todayUTC, uniqueEmail } from "./helpers";

const PASSWORD = "password123";

async function signedInUser(page: Page, label: string) {
  const email = uniqueEmail(label);
  await createUserInDb(email, PASSWORD, "Alert User");
  await logIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

/** The "Budget alerts" card on the settings page (the alert strip is also a region with that name). */
const settingsCard = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "Budget alerts" }) });

test.describe("budget alerts", () => {
  test("warns at 85%, turns to exceeded at 105%, stays dismissed after a reload", async ({ page }) => {
    const email = await signedInUser(page, "alerts-flow");
    await addBudgetFor(email, "Groceries", "100", "monthly");

    await page.goto("/dashboard");
    await expect(page.getByRole("status").filter({ hasText: "Groceries" })).toHaveCount(0);

    await addExpenseFor(email, "Groceries", "85", todayUTC());
    await page.reload();
    const warning = page.getByRole("status").filter({ hasText: "Groceries" });
    await expect(warning).toHaveText(/Groceries: 85% of your monthly budget used \(\$85\.00 of \$100\.00\)/);
    await expect(warning).toHaveAttribute("data-level", "warning");
    await warning.getByRole("link", { name: "View budgets" }).click();
    await expect(page).toHaveURL(/\/budgets$/);

    await addExpenseFor(email, "Groceries", "20", todayUTC());
    await page.reload();
    const exceeded = page.getByRole("status").filter({ hasText: "Groceries" });
    await expect(exceeded).toHaveAttribute("data-level", "exceeded");
    await expect(exceeded).toContainText("over your monthly budget ($105.00 of $100.00)");

    await exceeded.getByRole("button", { name: "Dismiss alert for Groceries" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Groceries" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Groceries" })).toHaveCount(0);
    await page.goto("/transactions");
    await expect(page.getByRole("status").filter({ hasText: "Groceries" })).toHaveCount(0);
  });

  test("turning alerts off in Settings removes the strip", async ({ page }) => {
    const email = await signedInUser(page, "alerts-off");
    await addBudgetFor(email, "Groceries", "100", "monthly");
    await addExpenseFor(email, "Groceries", "90", todayUTC());
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Groceries" })).toBeVisible();

    await page.goto("/profile/settings");
    await page.waitForLoadState("networkidle"); // hydrated: an earlier click would not reach React
    await page.getByRole("checkbox", { name: "Show budget alerts" }).uncheck();
    await settingsCard(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("status").filter({ hasText: "Groceries" })).toHaveCount(0);
  });

  test("a higher warning level hides an alert that the default would show", async ({ page }) => {
    const email = await signedInUser(page, "alerts-level");
    await addBudgetFor(email, "Groceries", "100", "monthly");
    await addExpenseFor(email, "Groceries", "60", todayUTC());
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Groceries" })).toHaveCount(0);

    await page.goto("/profile/settings");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Warn me at").selectOption("60");
    await settingsCard(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("status").filter({ hasText: "60% of your monthly budget used" })).toBeVisible();
  });
});
