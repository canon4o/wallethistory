import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { loginEvents, users as usersTable } from "@/db/schema";
import { LOGIN_EVENT_RETENTION_DAYS, recordLoginAttempt } from "@/lib/auth/login-events";
import { requestHeaders } from "../helpers/request-headers";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { getUserRow, useTestUsers } from "../helpers/users";

describe.skipIf(!TEST_DATABASE_URL)("login events", () => {
  const users = useTestUsers();

  beforeEach(() => requestHeaders.reset());
  afterAll(users.cleanup);

  async function eventsFor(userId: string) {
    return getDb()
      .select()
      .from(loginEvents)
      .where(eq(loginEvents.userId, userId))
      .orderBy(desc(loginEvents.createdAt));
  }

  it("records a success with ip and browser and sets last_login_at", async () => {
    const user = await users.create();
    requestHeaders.set("x-forwarded-for", "198.51.100.99, 203.0.113.7");
    requestHeaders.set("user-agent", "Mozilla/5.0 Test");
    await recordLoginAttempt({ email: user.email.toUpperCase(), userId: user.id, success: true });

    const [event] = await eventsFor(user.id);
    expect(event).toMatchObject({
      emailAttempted: user.email,
      success: true,
      reason: null,
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 Test",
    });
    expect((await getUserRow(user.id)).lastLoginAt).toBeInstanceOf(Date);
  });

  it("records a failure with its reason and leaves last_login_at alone", async () => {
    const user = await users.create();
    requestHeaders.set("x-forwarded-for", "198.51.100.2");
    await recordLoginAttempt({ email: user.email, userId: user.id, success: false, reason: "bad_password" });

    const [event] = await eventsFor(user.id);
    expect(event).toMatchObject({ success: false, reason: "bad_password", ip: "198.51.100.2", userAgent: null });
    expect((await getUserRow(user.id)).lastLoginAt).toBeNull();
  });

  it("records an unknown email without a user", async () => {
    const email = `nobody-${crypto.randomUUID()}@test.local`;
    await recordLoginAttempt({ email, userId: null, success: false, reason: "unknown_email" });
    const rows = await getDb().select().from(loginEvents).where(eq(loginEvents.emailAttempted, email));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
  });

  it("truncates a very long user agent", async () => {
    const user = await users.create();
    requestHeaders.set("user-agent", "x".repeat(1000));
    await recordLoginAttempt({ email: user.email, userId: user.id, success: false, reason: "blocked" });
    expect((await eventsFor(user.id))[0].userAgent).toHaveLength(300);
  });

  it("still records when there is no request scope", async () => {
    const user = await users.create();
    requestHeaders.unavailable = true;
    await recordLoginAttempt({ email: user.email, userId: user.id, success: false, reason: "unverified" });
    expect((await eventsFor(user.id))[0]).toMatchObject({ ip: null, userAgent: null });
  });

  it("removes events older than the retention period on a successful login", async () => {
    const user = await users.create();
    const old = new Date(Date.now() - (LOGIN_EVENT_RETENTION_DAYS + 1) * 86_400_000);
    await getDb()
      .insert(loginEvents)
      .values({ userId: user.id, emailAttempted: user.email, success: true, createdAt: old });
    await recordLoginAttempt({ email: user.email, userId: user.id, success: true });
    const rows = await eventsFor(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].createdAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it("never throws when the database write fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // A user id that does not exist violates the foreign key.
    await expect(
      recordLoginAttempt({ email: "x@test.local", userId: crypto.randomUUID(), success: true }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("deletes a user's events together with the user", async () => {
    const user = await users.create();
    await recordLoginAttempt({ email: user.email, userId: user.id, success: true });
    await getDb().delete(usersTable).where(eq(usersTable.id, user.id));
    expect(await eventsFor(user.id)).toHaveLength(0);
  });
});
