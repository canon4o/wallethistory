import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    // Loads .env / .env.local so DATABASE_URL_TEST is available to the tests.
    env: loadEnv("test", process.cwd(), ""),
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Scoped to the logic layer on purpose; components/app are covered by integration and E2E tests.
      include: [
        "lib/auth/**",
        "lib/cache/**",
        "lib/data/**",
        "lib/actions/**",
        "lib/validation/**",
        "lib/email/**",
        "lib/format.ts",
        "lib/i18n/**",
        "lib/reports/**",
        "lib/recurring/**",
        "lib/goals/**",
        "lib/category-icons.ts",
        "db/**",
      ],
      exclude: ["db/schema.ts", "db/migrations/**"],
      thresholds: {
        lines: 95,
        branches: 95,
      },
    },
  },
});
