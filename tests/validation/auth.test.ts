import { translate } from "@/lib/i18n/translate";
import { describe, expect, it } from "vitest";
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

const valid = {
  name: "  Ada  ",
  email: "  Ada@Example.COM ",
  password: "password123",
  confirmPassword: "password123",
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), translate("en", i.message)]));
}

describe("registerSchema", () => {
  it("trims the name and trims + lowercases the email", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.name).toBe("Ada");
    expect(parsed.email).toBe("ada@example.com");
  });

  it("requires a name of 1 to 100 characters", () => {
    expect(issues(registerSchema.safeParse({ ...valid, name: "   " })).name).toMatch(/required/i);
    expect(issues(registerSchema.safeParse({ ...valid, name: "x".repeat(101) })).name).toMatch(/at most 100/);
    expect(registerSchema.safeParse({ ...valid, name: "x".repeat(100) }).success).toBe(true);
  });

  it("rejects invalid or overlong emails", () => {
    expect(issues(registerSchema.safeParse({ ...valid, email: "nope" })).email).toMatch(/valid email/);
    const long = `${"a".repeat(250)}@x.com`;
    expect(registerSchema.safeParse({ ...valid, email: long }).success).toBe(false);
  });

  it("enforces password length 8 to 72", () => {
    const short = issues(registerSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" }));
    expect(short.password).toMatch(/at least 8/);
    const edge = "a".repeat(72);
    expect(registerSchema.safeParse({ ...valid, password: edge, confirmPassword: edge }).success).toBe(true);
    const long = "a".repeat(73);
    expect(issues(registerSchema.safeParse({ ...valid, password: long, confirmPassword: long })).password).toMatch(
      /at most 72/,
    );
  });

  it("counts bytes, not characters, because bcrypt only uses 72 bytes", () => {
    const multibyte = "é".repeat(40); // 40 characters, 80 bytes
    const result = registerSchema.safeParse({ ...valid, password: multibyte, confirmPassword: multibyte });
    expect(issues(result).password).toMatch(/at most 72/);
  });

  it("requires the confirmation to match", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "different123" });
    expect(issues(result).confirmPassword).toBe("Passwords do not match");
  });
});

describe("loginSchema", () => {
  it("only checks the shape and normalizes the email", () => {
    expect(loginSchema.parse({ email: " A@B.io ", password: "x" })).toEqual({ email: "a@b.io", password: "x" });
  });

  it("rejects an empty password or invalid email", () => {
    expect(issues(loginSchema.safeParse({ email: "a@b.io", password: "" })).password).toBeTruthy();
    expect(issues(loginSchema.safeParse({ email: "bad", password: "x" })).email).toBeTruthy();
  });
});

describe("emailOnlySchema", () => {
  it("validates and normalizes the email", () => {
    expect(emailOnlySchema.parse({ email: " X@Y.io " })).toEqual({ email: "x@y.io" });
    expect(emailOnlySchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const base = { token: "abc", password: "password123", confirmPassword: "password123" };

  it("accepts a token with a matching, valid password", () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a missing token, short password and mismatched confirmation", () => {
    expect(issues(resetPasswordSchema.safeParse({ ...base, token: "" })).token).toBeTruthy();
    expect(issues(resetPasswordSchema.safeParse({ ...base, password: "short", confirmPassword: "short" })).password).toBeTruthy();
    expect(issues(resetPasswordSchema.safeParse({ ...base, confirmPassword: "nope12345" })).confirmPassword).toBeTruthy();
  });
});
