import { expect, test, type Page } from "@playwright/test";
import { createUserInDb, logIn, pickOption, queryDb, uniqueEmail, userIdByEmail } from "./helpers";

const PASSWORD = "password123";

async function signedInUser(page: Page, label: string, name = "Goal User") {
  const email = uniqueEmail(label);
  await createUserInDb(email, PASSWORD, name);
  await logIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function addGoal(page: Page, input: { name: string; target: string; shared?: boolean }) {
  await page.getByRole("button", { name: "Add goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add goal" });
  await dialog.getByLabel("Name").fill(input.name);
  await dialog.getByLabel("Target ($)").fill(input.target);
  if (input.shared) await dialog.getByRole("checkbox", { name: "Share with my household" }).check();
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("goals", () => {
  test("create a goal, add and take out money, and see the account balance follow", async ({ page }) => {
    await signedInUser(page, "goal-flow");
    await page.goto("/goals");
    await expect(page.getByText("No goals yet")).toBeVisible();

    await addGoal(page, { name: "Travel to Japan", target: "1000" });
    await page.getByRole("link", { name: /Travel to Japan/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Travel to Japan" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Add money" }).click();
    const dialog = page.getByRole("dialog", { name: "Add money" });
    await dialog.getByLabel("Amount ($)").fill("250");
    await dialog.getByRole("button", { name: "Add money" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("25%")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Travel to Japan progress" })).toHaveAttribute("aria-valuenow", "25");
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);

    // The account balance dropped; the dashboard says how much is set aside.
    await page.goto("/profile/accounts");
    await expect(page.getByText("-$250.00").first()).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText("$250.00 set aside in goals")).toBeVisible();
    await expect(page.getByRole("region", { name: "Goals" }).getByRole("link", { name: "Travel to Japan" })).toBeVisible();

    // Take everything out again, then the goal can be deleted.
    await page.goto("/goals");
    await page.getByRole("link", { name: /Travel to Japan/ }).click();
    await page.getByRole("button", { name: "Take money out" }).click();
    const out = page.getByRole("dialog", { name: "Take money out" });
    await out.getByLabel("Amount ($)").fill("300");
    await out.getByRole("button", { name: "Take money out" }).click();
    await expect(out.getByText(/at most \$250\.00/).first()).toBeVisible();
    await out.getByLabel("Amount ($)").fill("250");
    await out.getByRole("button", { name: "Take money out" }).click();
    await expect(out).toBeHidden();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete goal" }).getByRole("button", { name: "Delete goal" }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByText("No goals yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /Travel to Japan/ })).toHaveCount(0);
    // It was used, so it was only hidden: the row and its history are still in the database.
    const [{ count }] = await queryDb<{ count: number }>((sql) => sql`select count(*)::int as count from goals where name = 'Travel to Japan' and deleted_at is not null`);
    expect(count).toBeGreaterThan(0);
  });

  test("a household member sees a shared goal and adds money from their own account", async ({ page, browser }) => {
    const annEmail = await signedInUser(page, "goal-ann", "Ann");
    const benEmail = uniqueEmail("goal-ben");
    await createUserInDb(benEmail, PASSWORD, "Ben");
    const [annId, benId] = [await userIdByEmail(annEmail), await userIdByEmail(benEmail)];
    const [{ id: household }] = await queryDb<{ id: string }>((sql) => sql`insert into households default values returning id`);
    await queryDb((sql) => sql`insert into household_members (household_id, user_id) values (${household}, ${annId}), (${household}, ${benId})`);

    await page.goto("/goals");
    await addGoal(page, { name: "New car", target: "5000", shared: true });
    await expect(page.getByText("Shared", { exact: true })).toBeVisible();

    const benContext = await browser.newContext();
    const benPage = await benContext.newPage();
    await logIn(benPage, benEmail, PASSWORD);
    await expect(benPage).toHaveURL(/\/dashboard$/);
    await benPage.goto("/goals");
    await benPage.getByRole("button", { name: "Shared with me" }).click();
    await benPage.getByRole("link", { name: /New car/ }).click();
    await expect(benPage.getByText("Ann's goal")).toBeVisible();
    await expect(benPage.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await benPage.getByRole("button", { name: "Add money" }).click();
    const dialog = benPage.getByRole("dialog", { name: "Add money" });
    await pickOption(dialog, "From account", "Cash");
    await dialog.getByLabel("Amount ($)").fill("500");
    await dialog.getByRole("button", { name: "Add money" }).click();
    await expect(dialog).toBeHidden();
    await expect(benPage.getByText("10%")).toBeVisible();
    await benContext.close();

    // Ann sees Ben's share on the goal page.
    await page.reload();
    await page.getByRole("link", { name: /New car/ }).click();
    await expect(page.getByText("Who saved")).toBeVisible();
    await expect(page.getByRole("region", { name: "Who saved" }).getByText("Ben", { exact: true })).toBeVisible();
    await queryDb((sql) => sql`delete from households where id = ${household}`);
  });
});
