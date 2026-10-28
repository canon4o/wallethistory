import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ADMIN, createUserInDb, latestEmailLink, logIn, queryDb, uniqueEmail, userIdByEmail } from "./helpers";

/** The Timezone field is a searchable dropdown: type, then click the match. */
async function pickTimezone(scope: Page | Locator, name: string) {
  const input = scope.getByRole("combobox", { name: "Timezone" });
  await input.click();
  await input.fill(name.split("/").pop() ?? name);
  await scope.getByRole("option", { name, exact: true }).click();
}

const regional = (email: string) =>
  queryDb<{ currency: string; timezone: string }>((sql) => sql`select currency, timezone from users where email = ${email}`);

test.describe("currency and timezone", () => {
  test("choose them at registration, then see amounts in that currency", async ({ page }) => {
    const email = uniqueEmail("regional");
    await page.goto("/register");
    await page.getByLabel("Name").fill("Eva Euro");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByLabel("Currency").selectOption("EUR");
    await pickTimezone(page, "Europe/Sofia");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
    expect(await regional(email)).toEqual([{ currency: "EUR", timezone: "Europe/Sofia" }]);

    await page.goto(await latestEmailLink(email));
    await logIn(page, email, "password123");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("€0.00").first()).toBeVisible();
    await expect(page.getByText("$0.00")).toHaveCount(0);
  });

  test("a user changes them in Settings", async ({ page }) => {
    const email = uniqueEmail("settings");
    await createUserInDb(email, "password123");
    expect(await regional(email)).toEqual([{ currency: "USD", timezone: "UTC" }]);
    await logIn(page, email, "password123");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("$0.00").first()).toBeVisible();

    await page.goto("/profile/settings");
    await page.getByLabel("Currency").selectOption("GBP");
    await pickTimezone(page, "Asia/Tokyo");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    expect(await regional(email)).toEqual([{ currency: "GBP", timezone: "Asia/Tokyo" }]);

    await page.goto("/dashboard");
    await expect(page.getByText("£0.00").first()).toBeVisible();
  });

  test("an admin changes a user's settings and the change is audited", async ({ page }) => {
    const email = uniqueEmail("admin-regional");
    await createUserInDb(email, "password123", "Regional Target");
    const userId = await userIdByEmail(email);

    await logIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/admin/users/${userId}`);
    const card = page.getByRole("region", { name: "Regional settings" });
    await card.getByLabel("Currency").selectOption("EUR");
    await pickTimezone(card, "Europe/Sofia");
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("Saved.")).toBeVisible();
    expect(await regional(email)).toEqual([{ currency: "EUR", timezone: "Europe/Sofia" }]);

    await page.goto("/admin/audit");
    await expect(page.getByText("Changed currency or timezone").first()).toBeVisible();
  });
});
