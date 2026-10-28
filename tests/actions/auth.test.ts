import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, categories, loginEvents, sessions, users as usersTable } from "@/db/schema";
import {
  forgotPassword,
  login,
  logout,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "@/lib/actions/auth";
import { NEUTRAL_RESEND_MESSAGE, NEUTRAL_RESET_MESSAGE } from "@/lib/actions/auth-messages";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { verifyPassword } from "@/lib/auth/password";
import { EMAIL_LIMIT, LIMITS } from "@/lib/auth/rate-limit";
import { MemoryAdapter, countHit, setCacheAdapter } from "@/lib/cache";
import { NoopAdapter } from "@/lib/cache/adapter";
import { createSession } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/auth/users";
import { sendEmail } from "@/lib/email/transport";
import { cookieJar } from "../helpers/cookie-jar";
import { resetTestEnv, testEnv } from "../helpers/env";
import { redirectTarget } from "../helpers/redirect";
import { requestHeaders } from "../helpers/request-headers";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { getUserRow, useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});
// The real setting lives in the shared test database; this file controls it directly so another
// test file turning signups off can never make these registrations fail.
const signup = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/auth/settings", () => ({ isSignupEnabled: async () => signup.enabled }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn(async () => true) }));

const sendEmailMock = vi.mocked(sendEmail);

function sentTo(email: string) {
  return sendEmailMock.mock.calls.map(([message]) => message).filter((message) => message.to === email);
}

function linkIn(message: { text: string }): string {
  const match = message.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in email");
  return match[0];
}

function tokenIn(message: { text: string }): string {
  return new URL(linkIn(message)).searchParams.get("token") ?? "";
}

async function loginReasons(userId: string) {
  const rows = await getDb().select().from(loginEvents).where(eq(loginEvents.userId, userId));
  return rows.map((row) => (row.success ? "success" : row.reason));
}

const newAccount = () => {
  const email = `Reg-${crypto.randomUUID()}@Test.local`;
  return {
    input: { name: "  Ada  ", email: ` ${email} `, password: "password123", confirmPassword: "password123" },
    email: email.toLowerCase(),
  };
};

describe.skipIf(!TEST_DATABASE_URL)("auth actions", () => {
  const users = useTestUsers();
  const registered: string[] = [];

  beforeEach(() => {
    signup.enabled = true;
    cookieJar.reset();
    resetTestEnv();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue(true);
  });

  afterAll(async () => {
    await users.cleanup();
    for (const email of registered) {
      const user = await findUserByEmail(email);
      if (user) await getDb().delete(usersTable).where(eq(usersTable.id, user.id));
    }
  });

  describe("register", () => {
    it("refuses new accounts while signups are closed, and creates nothing", async () => {
      signup.enabled = false;
      const { input, email } = newAccount();
      expect(await register(input)).toEqual({ ok: false, error: "New signups are currently closed." });
      expect(await findUserByEmail(email)).toBeNull();
      expect(sentTo(email)).toHaveLength(0);
    });

    it("still lets existing users log in while signups are closed", async () => {
      signup.enabled = false;
      const user = await users.create();
      expect(await redirectTarget(login({ email: user.email, password: user.password }))).toBe("/dashboard");
    });

    it("returns field errors for invalid input", async () => {
      const result = await register({ name: "", email: "bad", password: "short", confirmPassword: "x" });
      expect(result).toMatchObject({ ok: false });
      if (result.ok) return;
      expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["confirmPassword", "email", "name", "password"]);
    });

    it("without verification: verifies the email, signs in, sends a welcome email and goes to /dashboard", async () => {
      const { input, email } = newAccount();
      registered.push(email);
      expect(await redirectTarget(register(input))).toBe("/dashboard");

      const user = await findUserByEmail(email);
      expect(user).toMatchObject({ name: "Ada", email });
      expect(user?.emailVerifiedAt).not.toBeNull();
      expect(cookieJar.has(SESSION_COOKIE)).toBe(true);

      const welcome = sentTo(email);
      expect(welcome).toHaveLength(1);
      expect(welcome[0].subject).toMatch(/welcome/i);
      expect(welcome[0].text).toContain("Hi Ada,");
      expect(linkIn(welcome[0])).toBe("http://localhost:3000/dashboard");
    });

    it("stores the chosen currency and timezone", async () => {
      const { input, email } = newAccount();
      registered.push(email);
      await redirectTarget(register({ ...input, currency: "EUR", timezone: "europe/sofia" }));
      const [row] = await getDb().select().from(usersTable).where(eq(usersTable.email, email));
      expect(row).toMatchObject({ currency: "EUR", timezone: "Europe/Sofia" });
    });

    it("defaults to USD and UTC without a choice, and for an invalid one instead of failing", async () => {
      const plain = newAccount();
      registered.push(plain.email);
      await redirectTarget(register(plain.input));
      const invalid = newAccount();
      registered.push(invalid.email);
      await redirectTarget(register({ ...invalid.input, currency: "CHF", timezone: "Mars/Olympus" }));
      for (const email of [plain.email, invalid.email]) {
        const [row] = await getDb().select().from(usersTable).where(eq(usersTable.email, email));
        expect(row).toMatchObject({ currency: "USD", timezone: "UTC" });
      }
    });

    it("creates the Cash account and default categories for the new user", async () => {
      const { input, email } = newAccount();
      registered.push(email);
      await redirectTarget(register(input));
      const user = await findUserByEmail(email);
      const userAccounts = await getDb().select().from(accounts).where(eq(accounts.userId, user!.id));
      expect(userAccounts.map((a) => a.name)).toEqual(["Cash"]);
      const userCategories = await getDb().select().from(categories).where(eq(categories.userId, user!.id));
      expect(userCategories).toHaveLength(16);
    });

    it("with verification: no session, an unverified user and a verification email with a link", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const { input, email } = newAccount();
      registered.push(email);
      const result = await register(input);

      expect(result).toEqual({ ok: true, requiresVerification: true, email });
      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
      expect((await findUserByEmail(email))?.emailVerifiedAt).toBeNull();
      const [mail] = sentTo(email);
      expect(mail.subject).toMatch(/verify/i);
      expect(mail.text).toContain("Hi Ada,");
      expect(linkIn(mail)).toMatch(/^http:\/\/localhost:3000\/verify-email\?token=[\w-]{43}$/);
    });

    it("still succeeds when the verification email cannot be sent", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      sendEmailMock.mockResolvedValue(false);
      const { input, email } = newAccount();
      registered.push(email);
      expect(await register(input)).toMatchObject({ ok: true, requiresVerification: true });
    });

    it("rejects an email that is already used (any case) with a friendly message", async () => {
      const existing = await users.create({ label: "taken" });
      const result = await register({
        name: "Dup",
        email: existing.email.toUpperCase(),
        password: "password123",
        confirmPassword: "password123",
      });
      expect(result).toMatchObject({
        ok: false,
        error: "An account with this email already exists.",
        fieldErrors: { email: ["An account with this email already exists."] },
      });
      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    });
  });

  describe("login", () => {
    it("signs in with the right credentials (email is case-insensitive) and goes to /dashboard", async () => {
      const user = await users.create();
      expect(await redirectTarget(login({ email: user.email.toUpperCase(), password: user.password }))).toBe("/dashboard");
      expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
    });

    it("gives the same generic error for a wrong password and an unknown email", async () => {
      const user = await users.create();
      const wrongPassword = await login({ email: user.email, password: "wrong-password" });
      const unknownEmail = await login({ email: `nobody-${crypto.randomUUID()}@test.local`, password: "whatever123" });
      expect(wrongPassword).toEqual({ ok: false, error: "Invalid email or password" });
      expect(unknownEmail).toEqual(wrongPassword);
      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    });

    it("validates the input shape", async () => {
      expect(await login({ email: "bad", password: "" })).toMatchObject({ ok: false, fieldErrors: expect.any(Object) });
    });

    it("refuses unverified users when verification is required and offers a resend", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const user = await users.create({ verified: false });
      expect(await login({ email: user.email, password: user.password })).toEqual({
        ok: false,
        error: "Please verify your email before logging in.",
        code: "email_not_verified",
      });
      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    });

    it("does not reveal verification state to someone with the wrong password", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const user = await users.create({ verified: false });
      expect(await login({ email: user.email, password: "wrong-password" })).toEqual({
        ok: false,
        error: "Invalid email or password",
      });
    });

    it("lets verified users in when verification is required", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const user = await users.create({ verified: true });
      expect(await redirectTarget(login({ email: user.email, password: user.password }))).toBe("/dashboard");
    });

    it("lets unverified users in when verification is off", async () => {
      const user = await users.create({ verified: false });
      expect(await redirectTarget(login({ email: user.email, password: user.password }))).toBe("/dashboard");
    });

    it("refuses a blocked user with the generic error and logs the real reason", async () => {
      const user = await users.create();
      await getDb().update(usersTable).set({ blockedAt: new Date() }).where(eq(usersTable.id, user.id));
      expect(await login({ email: user.email, password: user.password })).toEqual({
        ok: false,
        error: "Invalid email or password",
      });
      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
      expect(await loginReasons(user.id)).toEqual(["blocked"]);
    });

    it("logs every outcome in the login events", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const unverified = await users.create({ verified: false });
      const verified = await users.create({ verified: true });

      await login({ email: unverified.email, password: unverified.password });
      await login({ email: verified.email, password: "wrong-password" });
      await redirectTarget(login({ email: verified.email, password: verified.password }));

      expect(await loginReasons(unverified.id)).toEqual(["unverified"]);
      expect((await loginReasons(verified.id)).sort()).toEqual(["bad_password", "success"]);
      expect((await getUserRow(verified.id)).lastLoginAt).toBeInstanceOf(Date);

      const unknown = `ghost-${crypto.randomUUID()}@test.local`;
      await login({ email: unknown, password: "whatever123" });
      const [ghost] = await getDb().select().from(loginEvents).where(eq(loginEvents.emailAttempted, unknown));
      expect(ghost).toMatchObject({ userId: null, success: false, reason: "unknown_email" });
    });
  });

  describe("logout", () => {
    it("deletes the session and cookie and goes to /login", async () => {
      const user = await users.create();
      await createSession(user.id);
      expect(await redirectTarget(logout())).toBe("/login");
      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
      expect(await getDb().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    });
  });

  describe("resendVerification", () => {
    it("sends a new link to an unverified user when verification is required", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const user = await users.create({ verified: false });
      expect(await resendVerification({ email: user.email })).toEqual({ ok: true, message: NEUTRAL_RESEND_MESSAGE });
      expect(sentTo(user.email)).toHaveLength(1);
    });

    it("answers identically but sends nothing for verified, unknown, or verification-off cases", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const verified = await users.create({ verified: true });
      const unverified = await users.create({ verified: false });
      const expected = { ok: true, message: NEUTRAL_RESEND_MESSAGE };
      expect(await resendVerification({ email: verified.email })).toEqual(expected);
      expect(await resendVerification({ email: "nobody@test.local" })).toEqual(expected);
      expect(sentTo(verified.email)).toHaveLength(0);

      testEnv.REQUIRE_EMAIL_VERIFICATION = false;
      expect(await resendVerification({ email: unverified.email })).toEqual(expected);
      expect(sentTo(unverified.email)).toHaveLength(0);
    });

    it("validates the email", async () => {
      expect(await resendVerification({ email: "bad" })).toMatchObject({ ok: false });
    });
  });

  describe("verifyEmail", () => {
    it("verifies the email once, then sends a welcome email", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const user = await users.create({ verified: false });
      await resendVerification({ email: user.email });
      const token = tokenIn(sentTo(user.email)[0]);
      sendEmailMock.mockClear();

      expect(await verifyEmail(token)).toEqual({ ok: true });
      expect((await getUserRow(user.id)).emailVerifiedAt).not.toBeNull();
      expect(sentTo(user.email).map((m) => m.subject)).toEqual(["Welcome to WalletHistory"]);

      expect(await verifyEmail(token)).toEqual({ ok: false, error: "This link is invalid or has expired." });
    });

    it("rejects unknown tokens and password-reset tokens", async () => {
      expect(await verifyEmail("garbage")).toMatchObject({ ok: false });
      const user = await users.create();
      await forgotPassword({ email: user.email });
      expect(await verifyEmail(tokenIn(sentTo(user.email)[0]))).toMatchObject({ ok: false });
    });
  });

  describe("forgotPassword", () => {
    it("emails a reset link (1 hour) to an existing user", async () => {
      const user = await users.create({ name: "Reset Me" });
      expect(await forgotPassword({ email: user.email })).toEqual({ ok: true, message: NEUTRAL_RESET_MESSAGE });
      const [mail] = sentTo(user.email);
      expect(mail.subject).toMatch(/reset/i);
      expect(mail.text).toContain("Hi Reset Me,");
      expect(linkIn(mail)).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[\w-]{43}$/);
    });

    it("gives the same answer and sends nothing for an unknown email", async () => {
      expect(await forgotPassword({ email: "nobody@test.local" })).toEqual({ ok: true, message: NEUTRAL_RESET_MESSAGE });
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("validates the email", async () => {
      expect(await forgotPassword({ email: "" })).toMatchObject({ ok: false });
    });
  });

  describe("resetPassword", () => {
    async function requestReset(email: string) {
      await forgotPassword({ email });
      const mails = sentTo(email);
      return tokenIn(mails[mails.length - 1]);
    }

    it("sets the new password, deletes every session, and sends the user to /login", async () => {
      const user = await users.create();
      await createSession(user.id);
      await createSession(user.id);
      const token = await requestReset(user.email);

      const target = await redirectTarget(
        resetPassword({ token, password: "new-password-1", confirmPassword: "new-password-1" }),
      );
      expect(target).toBe("/login?reset=1");

      const row = await getUserRow(user.id);
      expect(await verifyPassword("new-password-1", row.passwordHash)).toBe(true);
      expect(await verifyPassword(user.password, row.passwordHash)).toBe(false);
      expect(await getDb().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    });

    it("works only once", async () => {
      const user = await users.create();
      const token = await requestReset(user.email);
      const input = { token, password: "new-password-1", confirmPassword: "new-password-1" };
      await redirectTarget(resetPassword(input));
      expect(await resetPassword(input)).toEqual({ ok: false, error: "This link is invalid or has expired." });
    });

    it("rejects unknown tokens", async () => {
      expect(
        await resetPassword({ token: "nope", password: "new-password-1", confirmPassword: "new-password-1" }),
      ).toMatchObject({ ok: false, error: "This link is invalid or has expired." });
    });

    it("does not burn the token when the new password is invalid", async () => {
      const user = await users.create();
      const token = await requestReset(user.email);
      const bad = await resetPassword({ token, password: "short", confirmPassword: "short" });
      expect(bad).toMatchObject({ ok: false, fieldErrors: { password: expect.any(Array) } });
      const mismatch = await resetPassword({ token, password: "new-password-1", confirmPassword: "different-1" });
      expect(mismatch).toMatchObject({ ok: false, fieldErrors: { confirmPassword: ["Passwords do not match"] } });
      // The same link still works afterwards.
      expect(
        await redirectTarget(resetPassword({ token, password: "new-password-1", confirmPassword: "new-password-1" })),
      ).toBe("/login?reset=1");
    });
  });

  describe("rate limits and lockout", () => {
    const TOO_MANY = "Too many attempts. Please wait a while and try again.";
    let store: MemoryAdapter;

    beforeEach(() => {
      store = new MemoryAdapter();
      setCacheAdapter(store);
      requestHeaders.reset();
      requestHeaders.set("x-forwarded-for", `198.51.100.${Math.floor(Math.random() * 200) + 1}`);
    });
    afterEach(() => setCacheAdapter(undefined));

    it("locks an email after 5 failed logins, even with the right password, without running bcrypt", async () => {
      const user = await users.create();
      for (let i = 0; i < 5; i += 1) {
        expect(await login({ email: user.email, password: "wrong-password" })).toMatchObject({ error: "Invalid email or password" });
      }
      expect(await login({ email: user.email, password: user.password })).toEqual({
        ok: false,
        error: TOO_MANY,
        code: "rate_limited",
      });
      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
      // The refused attempt is not logged, so the lock cannot be extended by hammering it.
      expect(await loginReasons(user.id)).toEqual(Array(5).fill("bad_password"));
    });

    it("locks an unknown email the same way, so the lock does not reveal which emails exist", async () => {
      const ghost = `ghost-${crypto.randomUUID()}@test.local`;
      for (let i = 0; i < 5; i += 1) await login({ email: ghost, password: "whatever123" });
      expect(await login({ email: ghost, password: "whatever123" })).toMatchObject({ code: "rate_limited" });
    });

    it("lets a user in below the limit", async () => {
      const user = await users.create();
      for (let i = 0; i < 4; i += 1) await login({ email: user.email, password: "wrong-password" });
      expect(await redirectTarget(login({ email: user.email, password: user.password }))).toBe("/dashboard");
    });

    it("does not count failures older than the window", async () => {
      const old = await users.create();
      for (let i = 0; i < 5; i += 1) await login({ email: old.email, password: "wrong-password" });
      await getDb()
        .update(loginEvents)
        .set({ createdAt: new Date(Date.now() - 16 * 60 * 1000) })
        .where(eq(loginEvents.userId, old.id));
      expect(await redirectTarget(login({ email: old.email, password: old.password }))).toBe("/dashboard");
    });

    it("only counts wrong guesses, not blocked or unverified logins", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const user = await users.create({ verified: false });
      for (let i = 0; i < 6; i += 1) {
        expect(await login({ email: user.email, password: user.password })).toMatchObject({ code: "email_not_verified" });
      }
    });

    // Fills the window directly: running bcrypt dozens of times would only make the test slow.
    async function fillWindow(action: keyof typeof LIMITS) {
      for (let i = 0; i < LIMITS[action].limit; i += 1) {
        await countHit(`${action}:ip`, requestHeaders.get("x-forwarded-for") ?? "", LIMITS[action].windowSeconds);
      }
    }

    it("limits login attempts per IP", async () => {
      await login({ email: "nobody@test.local", password: "whatever123" });
      await fillWindow("login");
      expect(await login({ email: "someone-else@test.local", password: "whatever123" })).toMatchObject({
        code: "rate_limited",
      });
    });

    it("limits registrations per IP", async () => {
      const first = newAccount();
      expect(await redirectTarget(register(first.input))).toBe("/dashboard");
      registered.push(first.email);
      await fillWindow("register");
      expect(await register(newAccount().input)).toMatchObject({ ok: false, code: "rate_limited" });
    });

    it("limits password reset and verification emails per address", async () => {
      testEnv.REQUIRE_EMAIL_VERIFICATION = true;
      const user = await users.create({ verified: false });
      for (let i = 0; i < EMAIL_LIMIT.limit; i += 1) {
        expect(await forgotPassword({ email: user.email })).toMatchObject({ ok: true });
        expect(await resendVerification({ email: user.email })).toMatchObject({ ok: true });
      }
      expect(await forgotPassword({ email: user.email })).toMatchObject({ ok: false, code: "rate_limited" });
      expect(await resendVerification({ email: user.email })).toMatchObject({ ok: false, code: "rate_limited" });
      expect(sentTo(user.email)).toHaveLength(EMAIL_LIMIT.limit * 2);
    });

    it("limits password reset and verification requests per IP", async () => {
      for (let i = 0; i < LIMITS.forgotPassword.limit; i += 1) await forgotPassword({ email: `a${i}@test.local` });
      expect(await forgotPassword({ email: "b@test.local" })).toMatchObject({ code: "rate_limited" });
      for (let i = 0; i < LIMITS.resendVerification.limit; i += 1) await resendVerification({ email: `a${i}@test.local` });
      expect(await resendVerification({ email: "b@test.local" })).toMatchObject({ code: "rate_limited" });
    });

    it("does not limit by IP when the IP is unknown, and lets everything through without a cache", async () => {
      requestHeaders.reset();
      for (let i = 0; i < LIMITS.forgotPassword.limit + 2; i += 1) {
        expect(await forgotPassword({ email: `n${i}@test.local` })).toMatchObject({ ok: true });
      }
      setCacheAdapter(new NoopAdapter());
      requestHeaders.set("x-forwarded-for", "198.51.100.77");
      for (let i = 0; i < LIMITS.forgotPassword.limit + 2; i += 1) {
        expect(await forgotPassword({ email: "same@test.local" })).toMatchObject({ ok: true });
      }
    });
  });
});

