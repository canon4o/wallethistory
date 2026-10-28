import { expect, test } from "@playwright/test";
import { ADMIN, createUserInDb, latestEmailLink, logIn, uniqueEmail } from "./helpers";

test.describe("access control", () => {
  test("logged-out visitors are sent to /login from app routes and from /", async ({ page }) => {
    for (const path of ["/dashboard", "/transactions", "/budgets", "/profile/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a dead session cookie is cleared instead of causing a redirect loop", async ({ page, context }) => {
    await context.addCookies([{ name: "wh_session", value: "forged", url: "http://localhost:3100" }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).find((c) => c.name === "wh_session")).toBeUndefined();
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  });
});

test.describe("login and logout", () => {
  test("the seeded admin can log in, sees their name, and can log out", async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    const sidebar = page.locator("aside");
    // The seeded admin is called "Admin", like the navigation link: look at the name line only.
    await expect(sidebar.locator("p", { hasText: new RegExp(`^${ADMIN.name}$`) })).toBeVisible();
    await expect(sidebar.getByText(ADMIN.email)).toBeVisible();

    // Logged-in users are kept away from the guest pages, and / goes to the dashboard.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/register");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);

    await sidebar.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("wrong credentials give one generic error", async ({ page }) => {
    await logIn(page, ADMIN.email, "not-the-password");
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
    await logIn(page, "nobody@test.local", "whatever123");
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("form validation shows messages next to the fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
  });
});

test.describe("register and verify email", () => {
  test("register -> check email -> verify link -> login -> logout", async ({ page }) => {
    const email = uniqueEmail("register");
    await page.goto("/register");
    await page.getByLabel("Name").fill("Grace Hopper");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page).toHaveURL(/\/register$/); // no session yet

    // Logging in before verifying is refused, with a way to resend the link.
    await logIn(page, email, "password123");
    await expect(page.getByText("Please verify your email before logging in.")).toBeVisible();
    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByText("we sent a new link")).toBeVisible();

    const link = await latestEmailLink(email);
    expect(link).toMatch(/^http:\/\/localhost:3100\/verify-email\?token=/);
    await page.goto(link);
    // Loading the link must not verify: it takes an explicit click.
    await expect(page).toHaveURL(/\/verify-email\?token=/);
    await page.getByRole("button", { name: "Confirm email" }).click();
    await expect(page).toHaveURL(/\/login\?verified=1$/);
    await expect(page.getByText("Email verified. You can log in now.")).toBeVisible();

    // The link is single-use.
    await page.goto(link);
    await page.getByRole("button", { name: "Confirm email" }).click();
    await expect(page.getByText("This link is invalid or has expired.")).toBeVisible();

    await logIn(page, email, "password123");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("aside").getByText("Grace Hopper")).toBeVisible();

    await page.locator("aside").getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("registering an existing email shows a friendly error", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Admin Again");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("An account with this email already exists.").first()).toBeVisible();
  });

  test("register form validates passwords", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Short Pass");
    await page.getByLabel("Email").fill(uniqueEmail("invalid"));
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("different");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
  });

  test("an invalid verification link shows an error", async ({ page }) => {
    await page.goto("/verify-email?token=bogus");
    await expect(page.getByText("This link is invalid or has expired.")).toBeVisible();
    await page.goto("/verify-email");
    await expect(page.getByText("This link is invalid or has expired.")).toBeVisible();
  });
});

test.describe("forgot and reset password", () => {
  test("request a link, set a new password, old password stops working", async ({ page }) => {
    const email = uniqueEmail("reset");
    await createUserInDb(email, "old-password-1", "Reset User");

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If that email exists, we sent a link.")).toBeVisible();

    const link = await latestEmailLink(email);
    expect(link).toMatch(/^http:\/\/localhost:3100\/reset-password\?token=/);
    await page.goto(link);

    await page.getByLabel("New password", { exact: true }).fill("new-password-1");
    await page.getByLabel("Confirm new password").fill("something-else");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();

    await page.getByLabel("Confirm new password").fill("new-password-1");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText("Password updated.")).toBeVisible();

    await logIn(page, email, "old-password-1");
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await logIn(page, email, "new-password-1");
    await expect(page).toHaveURL(/\/dashboard$/);

    // The reset link cannot be used a second time.
    await page.locator("aside").getByRole("button", { name: "Log out" }).click();
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("third-password-1");
    await page.getByLabel("Confirm new password").fill("third-password-1");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByText("This link is invalid or has expired.")).toBeVisible();
  });

  test("an unknown email gets the same neutral message", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody-here@test.local");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If that email exists, we sent a link.")).toBeVisible();
  });

  test("a reset page without a token shows an error", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
  });
});
