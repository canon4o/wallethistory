import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLog, householdMembers, households, sessions, users as usersTable } from "@/db/schema";
import {
  getAdminOverview,
  getAdminOverviewCharts,
  getAdminUser,
  listAdminUsers,
  listAuditLog,
  listLoginEvents,
} from "@/lib/data/admin";
import { createSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { requestHeaders } from "../helpers/request-headers";
import { recordLoginAttempt } from "@/lib/auth/login-events";
import { insertTransaction, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const noUsers = { status: "all" as const, page: 1 };
const noLogins = { result: "all" as const, page: 1 };

describe.skipIf(!TEST_DATABASE_URL)("admin data", () => {
  const users = useTestUsers();
  const tag = crypto.randomUUID().slice(0, 8);
  let admin: { id: string; email: string };
  let ann: { id: string; email: string };
  let blocked: { id: string; email: string };
  let unverified: { id: string; email: string };

  beforeAll(async () => {
    admin = await users.create({ label: `admin-${tag}` });
    ann = await users.create({ label: `ann-${tag}`, name: `Ann ${tag}` });
    blocked = await users.create({ label: `blocked-${tag}` });
    unverified = await users.create({ label: `unverified-${tag}`, verified: false });
    await getDb().update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, admin.id));
    await getDb().update(usersTable).set({ blockedAt: new Date() }).where(eq(usersTable.id, blocked.id));
    await signInAs(admin.id);
  });
  afterAll(async () => {
    await users.cleanup();
  });

  describe("access", () => {
    it("is 404 for a regular user and a login redirect for a visitor", async () => {
      await signInAs(ann.id);
      await expect(getAdminOverview()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      await expect(listAdminUsers(noUsers)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      await expect(getAdminUser(ann.id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      await expect(getAdminOverviewCharts(30)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      await expect(listLoginEvents(noLogins)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      signOut();
      await expect(getAdminOverview()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
      await signInAs(admin.id);
    });
  });

  describe("overview", () => {
    it("counts users, new users, unverified, blocked and failed logins", async () => {
      // Other test files create and delete users at the same time, so only this file's own
      // rows are asserted: admin, ann, blocked, unverified and one more blocked + unverified user.
      const extra = await users.create({ verified: false });
      await getDb().update(usersTable).set({ blockedAt: new Date() }).where(eq(usersTable.id, extra.id));
      await recordLoginAttempt({ email: extra.email, userId: extra.id, success: false, reason: "blocked" });

      const overview = await getAdminOverview();
      expect(overview.totalUsers).toBeGreaterThanOrEqual(5);
      expect(overview.newLast7Days).toBeGreaterThanOrEqual(5);
      expect(overview.newLast30Days).toBeGreaterThanOrEqual(overview.newLast7Days);
      expect(overview.unverified).toBeGreaterThanOrEqual(2);
      expect(overview.blocked).toBeGreaterThanOrEqual(2);
      expect(overview.failedLogins24h).toBeGreaterThanOrEqual(1);
      expect(overview.active).toBeGreaterThanOrEqual(2);
      expect(overview.active + overview.blocked).toBeLessThanOrEqual(overview.totalUsers);
      expect(overview.newPrevious7Days).toBeGreaterThanOrEqual(0);
      expect(overview.failedLoginsPrevious24h).toBeGreaterThanOrEqual(0);
    });
  });

  describe("users list", () => {
    it("searches name and email, case-insensitively", async () => {
      const byName = await listAdminUsers({ ...noUsers, q: `ann ${tag}`.toUpperCase() });
      expect(byName.items.map((u) => u.id)).toEqual([ann.id]);
      const byEmail = await listAdminUsers({ ...noUsers, q: `unverified-${tag}` });
      expect(byEmail.items.map((u) => u.id)).toEqual([unverified.id]);
    });

    it("treats % and _ in the search as plain text", async () => {
      expect((await listAdminUsers({ ...noUsers, q: "%" })).items.every((u) => (u.name + u.email).includes("%"))).toBe(true);
      expect((await listAdminUsers({ ...noUsers, q: `ann_${tag}` })).total).toBe(0);
    });

    it("filters by status", async () => {
      const q = tag;
      const ids = async (status: "all" | "admins" | "blocked" | "unverified") =>
        (await listAdminUsers({ status, q, page: 1 })).items.map((u) => u.id).sort();
      expect(await ids("all")).toEqual([admin.id, ann.id, blocked.id, unverified.id].sort());
      expect(await ids("admins")).toEqual([admin.id]);
      expect(await ids("blocked")).toEqual([blocked.id]);
      expect(await ids("unverified")).toEqual([unverified.id]);
    });

    it("returns only safe fields", async () => {
      const [row] = (await listAdminUsers({ ...noUsers, q: `ann-${tag}` })).items;
      expect(Object.keys(row).sort()).toEqual(
        ["blocked", "createdAt", "email", "id", "lastLoginAt", "name", "role", "verified"].sort(),
      );
      expect(row).toMatchObject({ role: "user", verified: true, blocked: false });
    });

    it("paginates and clamps an out-of-range page", async () => {
      const result = await listAdminUsers({ status: "all", page: 100_000 });
      expect(result.page).toBe(result.pageCount);
      expect(result.items.length).toBeLessThanOrEqual(25);
    });
  });

  describe("user detail", () => {
    it("shows counts and household state, never amounts or names", async () => {
      const accountId = await defaultAccountId(ann.id);
      await insertTransaction({ userId: ann.id, accountId, type: "expense", amount: "12.34" });
      const [household] = await getDb().insert(households).values({}).returning();
      await getDb().insert(householdMembers).values({ householdId: household.id, userId: ann.id });
      await recordLoginAttempt({ email: ann.email, userId: ann.id, success: true });

      const detail = await getAdminUser(ann.id);
      expect(detail).toMatchObject({
        id: ann.id,
        inHousehold: true,
        transactionCount: 1,
        verified: true,
        blocked: false,
        blockedAt: null,
      });
      expect(detail?.accountCount).toBe(1);
      expect(detail?.lastLoginAt).toBeInstanceOf(Date);
      expect(detail?.recentLogins).toHaveLength(1);
      expect(JSON.stringify(detail)).not.toMatch(/12\.34|passwordHash|tokenHash/);

      await getDb().delete(households).where(eq(households.id, household.id));
    });

    it("lists active sessions with device info, not expired ones, and never the token", async () => {
      const target = await users.create();
      requestHeaders.set("user-agent", "Mozilla/5.0 (X11; Linux x86_64) Firefox/120");
      requestHeaders.set("x-forwarded-for", "203.0.113.9");
      await createSession(target.id);
      await createSession(target.id);
      requestHeaders.reset();
      const [expired] = await getDb().select().from(sessions).where(eq(sessions.userId, target.id));
      await getDb().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, expired.id));
      await signInAs(admin.id);

      const detail = await getAdminUser(target.id);
      expect(detail?.sessions).toHaveLength(1);
      expect(detail?.sessions[0]).toMatchObject({ ip: "203.0.113.9", userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/120" });
      expect(Object.keys(detail?.sessions[0] ?? {}).sort()).toEqual(
        ["createdAt", "expiresAt", "id", "ip", "lastSeenAt", "userAgent"],
      );
    });

    it("reports a blocked user and a user outside a household", async () => {
      const detail = await getAdminUser(blocked.id);
      expect(detail).toMatchObject({ blocked: true, inHousehold: false, transactionCount: 0 });
      expect(detail?.blockedAt).toBeInstanceOf(Date);
    });

    it("returns null for an unknown or malformed id", async () => {
      expect(await getAdminUser(crypto.randomUUID())).toBeNull();
      expect(await getAdminUser("not-a-uuid")).toBeNull();
    });
  });

  describe("overview charts", () => {
    it("returns one entry per day, oldest first, with today's activity", async () => {
      await recordLoginAttempt({ email: ann.email, userId: ann.id, success: true });
      await recordLoginAttempt({ email: ann.email, userId: ann.id, success: false, reason: "bad_password" });

      const week = await getAdminOverviewCharts(7);
      expect(week.signups).toHaveLength(7);
      const charts = await getAdminOverviewCharts(30);
      expect(charts.days).toBe(30);
      for (const series of [charts.signups, charts.logins, charts.failedLogins]) {
        expect(series).toHaveLength(30);
        expect(series.map((d) => d.day)).toEqual([...series.map((d) => d.day)].sort());
      }
      const today = new Date().toISOString().slice(0, 10);
      expect(charts.signups.at(-1)?.day).toBe(today);
      expect(charts.signups.at(-1)?.value).toBeGreaterThanOrEqual(4);
      expect(charts.logins.at(-1)?.value).toBeGreaterThanOrEqual(1);
      expect(charts.failedLogins.at(-1)?.value).toBeGreaterThanOrEqual(1);
    });
  });

  describe("login activity", () => {
    it("lists newest first, filters by result and user, and names the user", async () => {
      await recordLoginAttempt({ email: unverified.email, userId: unverified.id, success: false, reason: "unverified" });
      await recordLoginAttempt({ email: unverified.email, userId: unverified.id, success: true });

      const all = await listLoginEvents({ ...noLogins, userId: unverified.id });
      expect(all.items.map((e) => e.success)).toEqual([true, false]);
      expect(all.items[0].userName).toBe("Test User");

      const failed = await listLoginEvents({ result: "failed", userId: unverified.id, page: 1 });
      expect(failed.items).toHaveLength(1);
      expect(failed.items[0]).toMatchObject({ reason: "unverified", success: false });

      const ok = await listLoginEvents({ result: "success", userId: unverified.id, page: 1 });
      expect(ok.items.map((e) => e.success)).toEqual([true]);
    });

    it("includes attempts for unknown emails without a user", async () => {
      const ghost = `ghost-${tag}@test.local`;
      await recordLoginAttempt({ email: ghost, userId: null, success: false, reason: "unknown_email" });
      const result = await listLoginEvents({ result: "failed", page: 1 });
      const row = result.items.find((e) => e.email === ghost);
      expect(row).toMatchObject({ userId: null, userName: null, reason: "unknown_email" });
    });

    it("clamps an out-of-range page", async () => {
      const result = await listLoginEvents({ result: "all", page: 100_000 });
      expect(result.page).toBe(result.pageCount);
    });
  });

  describe("audit log", () => {
    it("lists admin actions newest first with snapshot emails", async () => {
      const target = await users.create();
      await writeAuditLog(getDb(), { actor: admin, action: "blocked", target });
      await writeAuditLog(getDb(), { actor: admin, action: "signup_disabled" });
      const result = await listAuditLog(1);
      const mine = result.items.filter((row) => row.actorId === admin.id);
      expect(mine.map((row) => row.action).slice(0, 2)).toEqual(["signup_disabled", "blocked"]);
      expect(mine[1]).toMatchObject({ targetEmail: target.email, targetUserId: target.id, actorEmail: admin.email });
      expect(mine[0]).toMatchObject({ targetEmail: null, targetUserId: null });
      await getDb().delete(adminAuditLog).where(eq(adminAuditLog.actorId, admin.id));
    });

    it("clamps an out-of-range page", async () => {
      const result = await listAuditLog(100_000);
      expect(result.page).toBe(result.pageCount);
    });
  });
});
