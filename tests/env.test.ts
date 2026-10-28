import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db", APP_URL: "http://localhost:3000" };

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(base);
    expect(env.DEPLOYMENT_MODE).toBe("self-hosted");
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(false);
    expect(env.SMTP_HOST).toBe("");
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, SMTP_PORT: "", DEPLOYMENT_MODE: "", SMTP_HOST: "" });
    expect(env.SMTP_PORT).toBe(587);
    expect(env.DEPLOYMENT_MODE).toBe("self-hosted");
  });

  it("parses booleans, numbers and deployment mode", () => {
    const env = parseEnv({
      ...base,
      REQUIRE_EMAIL_VERIFICATION: "true",
      SMTP_SECURE: "true",
      SMTP_PORT: "465",
      DEPLOYMENT_MODE: "self-hosted",
    });
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(true);
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.SMTP_PORT).toBe(465);
    expect(env.DEPLOYMENT_MODE).toBe("self-hosted");
  });

  it("fails fast with a readable message", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...base, APP_URL: "nope" })).toThrow(/APP_URL/);
    expect(() => parseEnv({ ...base, DEPLOYMENT_MODE: "cloud" })).toThrow(/DEPLOYMENT_MODE/);
  });
});
