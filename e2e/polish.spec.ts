import { expect, test, type Page } from "@playwright/test";
import { addBudgetFor, addBulkTransactions, addTagFor, createUserInDb, logIn, uniqueEmail } from "./helpers";

const PASSWORD = "password123";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password?token=x", "/verify-email?token=x"];
const APP_ROUTES = [
  "/dashboard",
  "/transactions",
  "/budgets",
  "/profile/settings",
  "/profile/accounts",
  "/profile/categories",
  "/profile/tags",
];

/** Facts about the rendered page that accessibility and responsiveness depend on. */
async function inspect(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && el.getClientRects().length > 0;
    };
    const accessibleName = (el: HTMLElement) => {
      const label = el.getAttribute("aria-label")?.trim();
      if (label) return label;
      const by = el.getAttribute("aria-labelledby");
      if (by) {
        const text = by.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
        if (text) return text;
      }
      const labels = (el as HTMLInputElement).labels;
      if (labels?.length) {
        const text = [...labels].map((l) => l.textContent ?? "").join(" ").trim();
        if (text) return text;
      }
      return el.textContent?.trim() || el.getAttribute("title")?.trim() || "";
    };

    const controls = [...document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), select, textarea")]
      .filter(visible)
      .filter((el) => el.getAttribute("href") !== "#main"); // the skip link is only shown on focus

    return {
      controlCount: controls.length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      title: document.title,
      h1: [...document.querySelectorAll("h1")].filter(visible).length,
      mains: [...document.querySelectorAll("main")].filter(visible).length,
      unnamed: controls.filter((el) => !accessibleName(el)).map((el) => el.outerHTML.slice(0, 120)),
      // Buttons, links and fields should be at least 40px tall. Checkboxes and radios are visually
      // hidden inputs whose label is the real target.
      small: controls
        .filter((el) => !(el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)))
        .filter((el) => el.getBoundingClientRect().height < 39.5)
        .map((el) => `${el.tagName.toLowerCase()} "${accessibleName(el).slice(0, 40)}" ${Math.round(el.getBoundingClientRect().height)}px`),
    };
  });
}

async function checkPage(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  const facts = await inspect(page);
  expect.soft(facts.controlCount, `${route}: the checks found no controls (is the page empty?)`).toBeGreaterThan(0);
  expect.soft(facts.overflow, `${route}: horizontal overflow`).toBe(false);
  expect.soft(facts.h1, `${route}: exactly one visible h1`).toBe(1);
  expect.soft(facts.mains, `${route}: exactly one visible main landmark`).toBe(1);
  expect.soft(facts.title, `${route}: page title`).toMatch(/\S+ \| WalletHistory$/);
  expect.soft(facts.unnamed, `${route}: controls without an accessible name`).toEqual([]);
  expect.soft(facts.small, `${route}: controls under 40px tall`).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test.describe(`accessibility and layout at ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("public pages", async ({ page }) => {
      for (const route of PUBLIC_ROUTES) await checkPage(page, route);
    });

    test("app pages, with data", async ({ page }) => {
      const email = uniqueEmail(`polish-${viewport.name}`);
      await createUserInDb(email, PASSWORD, "Polish User");
      await addTagFor(email, "trip");
      await addBulkTransactions(email, 3);
      await addBudgetFor(email, "Rent", "100", "monthly");
      await logIn(page, email, PASSWORD);
      await expect(page).toHaveURL(/\/dashboard$/);
      for (const route of APP_ROUTES) await checkPage(page, route);
    });
  });
}

test.describe("keyboard and focus", () => {
  test("the skip link is the first tab stop and moves focus to the main content", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("dialogs close with Escape and give focus back to the button that opened them", async ({ page }) => {
    const email = uniqueEmail("polish-dialog");
    await createUserInDb(email, PASSWORD, "Polish User");
    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/profile/tags");

    const open = page.getByRole("button", { name: "Add tag" });
    await open.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add tag" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Name")).toBeFocused(); // focus moves into the dialog

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("form fields are reachable and submit with the keyboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").focus();
    await page.keyboard.type("admin@admin.com");
    await page.keyboard.press("Tab");
    await page.keyboard.type("adminpass");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("every interactive element shows a visible focus indicator", async ({ page }) => {
    await page.goto("/login");
    const indicators: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      indicators.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const style = getComputedStyle(el);
          const outlined = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
          const shown = el.getAttribute("href") === "#main" || outlined || style.boxShadow !== "none";
          return shown ? "ok" : `${el.tagName} "${el.textContent?.slice(0, 30)}" has no focus indicator`;
        }),
      );
    }
    expect(indicators.filter((entry) => entry !== "ok")).toEqual([]);
  });
});

test.describe("not found", () => {
  test("an unknown URL shows a friendly 404 with a way back", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page).toHaveTitle("Page not found | WalletHistory");
    await page.getByRole("link", { name: "Go to WalletHistory" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
