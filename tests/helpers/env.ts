import type { Env } from "@/lib/env";

/** Mutable environment used by tests that mock `@/lib/env`. */
export const testEnv: Env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  APP_URL: "http://localhost:3000",
  DATABASE_POOL_MAX: 10,
  REDIS_URL: "",
  TRUSTED_PROXY_HOPS: 1,
  DEPLOYMENT_MODE: "hosted",
  REQUIRE_EMAIL_VERIFICATION: false,
  SMTP_HOST: "",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "WalletHistory <noreply@example.com>",
};

export function resetTestEnv() {
  Object.assign(testEnv, {
    APP_URL: "http://localhost:3000",
    REQUIRE_EMAIL_VERIFICATION: false,
    SMTP_HOST: "",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: "",
    SMTP_PASS: "",
  });
}
