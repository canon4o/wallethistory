import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Reads .env.local so DATABASE_URL_TEST is available here and in the test workers.
loadEnvConfig(process.cwd());

const PORT = 3100;
const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("Set DATABASE_URL_TEST (a disposable database) before running the E2E tests.");
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database and one dev server: run sequentially.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Optional: use an already-installed Chromium instead of Playwright's own download.
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        },
      },
    },
  ],
  webServer: {
    // Server output is copied to .e2e-mail.log: with SMTP_HOST empty, emails are printed there,
    // which is how the tests read verification and reset links. No real email is ever sent.
    command: `sh -c "npx next dev -p ${PORT} 2>&1 | tee .e2e-mail.log"`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      APP_URL: `http://localhost:${PORT}`,
      REQUIRE_EMAIL_VERIFICATION: "true",
      SMTP_HOST: "",
    },
  },
});
