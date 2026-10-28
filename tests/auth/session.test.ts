import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users as usersTable } from "@/db/schema";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import {
  createSession,
  deleteOtherSessions,
  destroyCurrentSession,
  getCurrentUser,
  requireAdmin,
  requireUser,
} from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";
import { cookieJar } from "../helpers/cookie-jar";
import { resetTestEnv, testEnv } from "../helpers/env";
import { requestHeaders } from "../helpers/request-headers";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe.skipIf(!TEST_DATABASE_URL)("sessions", () => {
  const users = useTestUsers();

  beforeEach(() => {
    cookieJar.reset();
    requestHeaders.reset();
  });
  afterAll(users.cleanup);

  async function sessionRowFor(token: string) {
    const [row] = await getDb().select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    return row;
  }

  it("creates a session: hashed token in the database, raw token in an httpOnly cookie", async () => {
    const user = await users.create();
    await createSession(user.id);

    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    expect(token).toHaveLength(43);
    expect(cookieJar.lastSetOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: false,
    });
    const row = await sessionRowFor(token);
    expect(row.userId).toBe(user.id);
    expect(row.tokenHash).not.toBe(token);
    const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
  });

  it("stores the IP, browser and last-seen time of the request", async () => {
    const user = await users.create();
    requestHeaders.set("x-forwarded-for", "198.51.100.4");
    requestHeaders.set("user-agent", "Test Browser");
    await createSession(user.id);
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    expect(await sessionRowFor(token)).toMatchObject({ ip: "198.51.100.4", userAgent: "Test Browser" });
    expect((await sessionRowFor(token)).lastSeenAt).toBeInstanceOf(Date);
  });

  it("updates last-seen when the session is renewed", async () => {
    const user = await users.create();
    await createSession(user.id);
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    const old = new Date(Date.now() - 86_400_000);
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 86_400_000), lastSeenAt: old })
      .where(eq(sessions.tokenHash, hashToken(token)));
    await getCurrentUser();
    expect((await sessionRowFor(token)).lastSeenAt!.getTime()).toBeGreaterThan(old.getTime());
  });

  it("marks the cookie secure in production when the app is served over https", async () => {
    vi.stubEnv("NODE_ENV", "production");
    testEnv.APP_URL = "https://wallet.example.com";
    const user = await users.create();
    await createSession(user.id);
    expect(cookieJar.lastSetOptions).toMatchObject({ secure: true });
    vi.unstubAllEnvs();
    resetTestEnv();
  });

  it("does not mark the cookie secure on a plain http APP_URL (self-hosted on a LAN)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    testEnv.APP_URL = "http://192.168.0.121:1314";
    const user = await users.create();
    await createSession(user.id);
    expect(cookieJar.lastSetOptions).toMatchObject({ secure: false });
    vi.unstubAllEnvs();
    resetTestEnv();
  });

  it("returns the currency and timezone of the user", async () => {
    const user = await users.create({ currency: "EUR", timezone: "Europe/Sofia" });
    await createSession(user.id);
    expect(await getCurrentUser()).toMatchObject({ currency: "EUR", timezone: "Europe/Sofia" });
  });

  it("falls back to the defaults for a stored value the app does not know", async () => {
    const user = await users.create();
    await getDb().update(usersTable).set({ currency: "CHF", timezone: "Mars/Olympus" }).where(eq(usersTable.id, user.id));
    await createSession(user.id);
    expect(await getCurrentUser()).toMatchObject({ currency: "USD", timezone: "UTC" });
  });

  it("returns id, email and name for a valid session and nothing else", async () => {
    const user = await users.create({ name: "Grace" });
    await createSession(user.id);
    const current = await getCurrentUser();
    expect(current).toEqual({
      id: user.id,
      email: user.email,
      name: "Grace",
      role: "user",
      currency: "USD",
      timezone: "UTC",
      budgetAlertsEnabled: true,
      budgetAlertThreshold: 80,
    });
  });

  it("returns null without a cookie", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null and clears the cookie for an unknown token", async () => {
    cookieJar.set(SESSION_COOKIE, "forged-token");
    expect(await getCurrentUser()).toBeNull();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("returns null for an expired session", async () => {
    const user = await users.create();
    await createSession(user.id);
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashToken(token)));
    expect(await getCurrentUser()).toBeNull();
  });

  it("does not throw when it cannot clear the cookie while rendering", async () => {
    cookieJar.set(SESSION_COOKIE, "forged-token");
    cookieJar.readOnly = true;
    expect(await getCurrentUser()).toBeNull();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
  });

  it("renews the session once less than half of its lifetime is left", async () => {
    const user = await users.create();
    await createSession(user.id);
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    const soon = new Date(Date.now() + 5 * 86_400_000);
    await getDb().update(sessions).set({ expiresAt: soon }).where(eq(sessions.tokenHash, hashToken(token)));

    await getCurrentUser();
    const renewed = await sessionRowFor(token);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it("does not touch a session with more than half of its lifetime left", async () => {
    const user = await users.create();
    await createSession(user.id);
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    const before = (await sessionRowFor(token)).expiresAt.getTime();
    cookieJar.lastSetOptions = undefined;
    await getCurrentUser();
    expect((await sessionRowFor(token)).expiresAt.getTime()).toBe(before);
    expect(cookieJar.lastSetOptions).toBeUndefined();
  });

  it("still renews in the database when the cookie cannot be refreshed", async () => {
    const user = await users.create();
    await createSession(user.id);
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 86_400_000) })
      .where(eq(sessions.tokenHash, hashToken(token)));
    cookieJar.readOnly = true;
    expect(await getCurrentUser()).not.toBeNull();
    expect((await sessionRowFor(token)).expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it("requireUser returns the user when signed in", async () => {
    const user = await users.create();
    await createSession(user.id);
    expect((await requireUser()).id).toBe(user.id);
  });

  it("requireUser redirects to /login without a cookie", async () => {
    expect(await redirectTarget(requireUser())).toBe("/login");
  });

  it("requireUser sends a dead cookie to /session/expired so it gets cleared", async () => {
    cookieJar.set(SESSION_COOKIE, "forged-token");
    cookieJar.readOnly = true; // rendering: the cookie cannot be deleted here
    expect(await redirectTarget(requireUser())).toBe("/session/expired");
  });

  it("logout deletes the session row and the cookie", async () => {
    const user = await users.create();
    await createSession(user.id);
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    await destroyCurrentSession();
    expect(await sessionRowFor(token)).toBeUndefined();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("deleteOtherSessions keeps the current session and removes the rest", async () => {
    const user = await users.create();
    await createSession(user.id);
    await createSession(user.id);
    await createSession(user.id); // the cookie holds this one
    const token = cookieJar.get(SESSION_COOKIE)?.value ?? "";
    await deleteOtherSessions(user.id);
    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(token));
  });

  it("deleteOtherSessions without a cookie removes every session of the user", async () => {
    const user = await users.create();
    await createSession(user.id);
    cookieJar.reset();
    await deleteOtherSessions(user.id);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });

  it("logout without a session just clears the cookie", async () => {
    await destroyCurrentSession();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("returns null for a blocked user even with a valid session row", async () => {
    const user = await users.create();
    await createSession(user.id);
    await getDb().update(usersTable).set({ blockedAt: new Date() }).where(eq(usersTable.id, user.id));
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the role from the database, not from the cookie", async () => {
    const user = await users.create();
    await createSession(user.id);
    await getDb().update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, user.id));
    expect(await getCurrentUser()).toMatchObject({ id: user.id, role: "admin" });
  });

  it("requireAdmin returns an admin", async () => {
    const user = await users.create();
    await getDb().update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, user.id));
    await createSession(user.id);
    expect(await requireAdmin()).toMatchObject({ id: user.id, role: "admin" });
  });

  it("requireAdmin answers 404 for a regular user", async () => {
    const user = await users.create();
    await createSession(user.id);
    await expect(requireAdmin()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("requireAdmin sends a visitor without a session to /login", async () => {
    expect(await redirectTarget(requireAdmin())).toBe("/login");
  });
});
