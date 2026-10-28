import { expect, test } from "@playwright/test";
import { ADMIN, logIn } from "./helpers";

test.describe("desktop navigation", () => {
  test("highlights the active item and expands the Profile group", async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    await sidebar.getByRole("link", { name: "Transactions" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(sidebar.getByRole("link", { name: "Transactions" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");

    const profile = sidebar.getByRole("button", { name: "Profile" });
    await expect(profile).toHaveAttribute("aria-expanded", "false");
    await profile.click();
    await expect(profile).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Settings", "Accounts", "Categories", "Tags"]) {
      await expect(sidebar.getByRole("link", { name })).toBeVisible();
    }
    await sidebar.getByRole("link", { name: "Accounts" }).click();
    await expect(page).toHaveURL(/\/profile\/accounts$/);

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile\/settings$/);
    await expect(page.locator("aside").getByRole("button", { name: "Profile" })).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the menu button opens a drawer with the same items and closes after navigating", async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    await expect(page.locator("aside")).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(ADMIN.email)).toBeVisible();
    await drawer.getByRole("link", { name: "Budgets" }).click();
    await expect(page).toHaveURL(/\/budgets$/);
    await expect(drawer).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("auth pages fit a phone screen", async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
