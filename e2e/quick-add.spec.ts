import { expect, test } from "@playwright/test";
import { ADMIN, logIn } from "./helpers";

test.describe("quick add speed dial", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("opens the three actions and the transaction form on a phone", async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Quick add" }).click();
    for (const name of ["Add transaction", "Add transfer", "Goal deposit"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await page.getByRole("button", { name: "Add transaction" }).click();
    await expect(page.getByRole("dialog", { name: "Add transaction" })).toBeVisible();
  });

  test("is not shown on reports", async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    await page.goto("/reports/cash-flow");
    await expect(page.getByRole("button", { name: "Quick add" })).toHaveCount(0);
  });
});

test.describe("quick add on desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("is hidden", async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Quick add" })).toBeHidden();
  });
});
