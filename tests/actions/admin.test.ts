import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  adminAuditLog,
  authTokens,
  householdMembers,
  households,
  sessions,
  transfers,
  users as usersTable,
} from "@/db/schema";
import { login } from "@/lib/actions/auth";
import {
  blockUser,
  changeUserRole,
  deleteUser,
  revokeUserSession,
  revokeUserSessions,
  unblockUser,
  verifyUserEmail,
} from "@/lib/actions/admin";
import { createSession } from "@/lib/auth/session";
import { redirectTarget } from "../helpers/redirect";
import { cookieJar } from "../helpers/cookie-jar";
import { defaultAccountId, insertTransaction } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { getUserRow, useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

// Lets one test make requireAdmin() succeed for a user who is no longer an admin in the database,
// which is what happens when another admin demotes them while their request is in flight.
const staleAdmin = vi.hoisted(() => ({ value: null as null | { id: string; email: string; name: string; role: "admin" } }));
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireAdmin: async () => staleAdmin.value ?? actual.requireAdmin() };
});

describe.skipIf(!TEST_DATABASE_URL)("admin actions", () => {
  const users = useTestUsers();
  let admin: { id: string; email: string };

  async function makeAdmin(label = "admin") {
    const user = await users.create({ label });
    await getDb().update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, user.id));
    return user;
  }

  async function auditFor(targetId: string) {
    return getDb()
      .select()
      .from(adminAuditLog)
      .where(eq(adminAuditLog.targetUserId, targetId))
      .orderBy(desc(adminAuditLog.createdAt));
  }

  async function sessionCount(userId: string) {
    return (await getDb().select().from(sessions).where(eq(sessions.userId, userId))).length;
  }

  beforeEach(async () => {
    staleAdmin.value = null;
    admin = await makeAdmin();
    await signInAs(admin.id);
  });
  afterAll(users.cleanup);

  describe("access and input", () => {
    it("answers 404 to a regular user for every action and changes nothing", async () => {
      const regular = await users.create();
      const target = await users.create();
      await signInAs(regular.id);
      const input = { userId: target.id };
      const calls = [
        () => changeUserRole({ ...input, role: "admin" }),
        () => blockUser(input),
        () => unblockUser(input),
        () => verifyUserEmail(input),
        () => revokeUserSessions(input),
        () => revokeUserSession({ ...input, sessionId: crypto.randomUUID() }),
        () => deleteUser({ ...input, confirmEmail: target.email }),
      ];
      for (const call of calls) {
        await expect(call()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      }
      expect(await getUserRow(target.id)).toMatchObject({ role: "user", blockedAt: null });
    });

    it("sends a visitor without a session to /login", async () => {
      cookieJar.reset();
      expect(await redirectTarget(blockUser({ userId: crypto.randomUUID() }))).toBe("/login");
    });

    it("validates ids, roles and the confirmation email", async () => {
      expect(await blockUser({ userId: "nope" })).toMatchObject({ ok: false, fieldErrors: { userId: expect.any(Array) } });
      expect(await changeUserRole({ userId: crypto.randomUUID(), role: "owner" })).toMatchObject({ ok: false });
      expect(await deleteUser({ userId: crypto.randomUUID(), confirmEmail: " " })).toMatchObject({ ok: false });
    });

    it("refuses to act on the admin's own account", async () => {
      const own = { userId: admin.id };
      for (const result of [
        await changeUserRole({ ...own, role: "user" }),
        await blockUser(own),
        await unblockUser(own),
        await verifyUserEmail(own),
        await revokeUserSessions(own),
        await deleteUser({ ...own, confirmEmail: admin.email }),
      ]) {
        expect(result).toEqual({ ok: false, error: "You can't do this to your own account." });
      }
      expect(await getUserRow(admin.id)).toMatchObject({ role: "admin", blockedAt: null });
    });

    it("reports an unknown user", async () => {
      expect(await blockUser({ userId: crypto.randomUUID() })).toEqual({ ok: false, error: "This user no longer exists." });
    });

    it("stops an admin who lost admin access while the request was running", async () => {
      const other = await makeAdmin("other");
      const target = await users.create();
      await getDb().update(usersTable).set({ role: "user" }).where(eq(usersTable.id, other.id));
      staleAdmin.value = { id: other.id, email: other.email, name: "Other", role: "admin" };
      expect(await blockUser({ userId: target.id })).toEqual({ ok: false, error: "You no longer have admin access." });
      expect((await getUserRow(target.id)).blockedAt).toBeNull();
    });

    it("stops an admin who was blocked while the request was running", async () => {
      const other = await makeAdmin("other");
      const target = await users.create();
      await getDb().update(usersTable).set({ blockedAt: new Date() }).where(eq(usersTable.id, other.id));
      staleAdmin.value = { id: other.id, email: other.email, name: "Other", role: "admin" };
      expect(await changeUserRole({ userId: target.id, role: "admin" })).toMatchObject({ ok: false });
      expect((await getUserRow(target.id)).role).toBe("user");
    });
  });

  describe("changeUserRole", () => {
    it("promotes a user and records it", async () => {
      const target = await users.create();
      expect(await changeUserRole({ userId: target.id, role: "admin" })).toEqual({ ok: true });
      expect((await getUserRow(target.id)).role).toBe("admin");
      const [entry] = await auditFor(target.id);
      expect(entry).toMatchObject({
        action: "role_changed",
        actorId: admin.id,
        actorEmail: admin.email,
        targetEmail: target.email,
        detail: { from: "user", to: "admin" },
      });
    });

    it("demotes an admin and signs them out everywhere", async () => {
      const other = await makeAdmin("other");
      await createSession(other.id);
      await signInAs(admin.id);
      expect(await sessionCount(other.id)).toBe(1);

      expect(await changeUserRole({ userId: other.id, role: "user" })).toEqual({ ok: true });
      expect((await getUserRow(other.id)).role).toBe("user");
      expect(await sessionCount(other.id)).toBe(0);
    });

    it("does nothing, and logs nothing, when the role is already set", async () => {
      const target = await users.create();
      expect(await changeUserRole({ userId: target.id, role: "user" })).toEqual({ ok: true });
      expect(await auditFor(target.id)).toHaveLength(0);
    });
  });

  describe("block and unblock", () => {
    it("blocks: signs the user out, refuses their login, and logs it", async () => {
      const target = await users.create();
      await createSession(target.id);
      await signInAs(admin.id);

      expect(await blockUser({ userId: target.id })).toEqual({ ok: true });
      expect((await getUserRow(target.id)).blockedAt).toBeInstanceOf(Date);
      expect(await sessionCount(target.id)).toBe(0);
      expect((await auditFor(target.id)).map((e) => e.action)).toEqual(["blocked"]);

      cookieJar.reset();
      expect(await login({ email: target.email, password: target.password })).toEqual({
        ok: false,
        error: "Invalid email or password",
      });
    });

    it("blocking twice changes and logs nothing the second time", async () => {
      const target = await users.create();
      await blockUser({ userId: target.id });
      await blockUser({ userId: target.id });
      expect(await auditFor(target.id)).toHaveLength(1);
    });

    it("unblocks: the user can log in again, all data intact", async () => {
      const target = await users.create();
      await blockUser({ userId: target.id });
      expect(await unblockUser({ userId: target.id })).toEqual({ ok: true });
      expect((await getUserRow(target.id)).blockedAt).toBeNull();
      expect((await auditFor(target.id)).map((e) => e.action)).toEqual(["unblocked", "blocked"]);
      expect((await getDb().select().from(accounts).where(eq(accounts.userId, target.id))).length).toBe(1);

      cookieJar.reset();
      expect(await redirectTarget(login({ email: target.email, password: target.password }))).toBe("/dashboard");
    });

    it("unblocking someone who is not blocked changes and logs nothing", async () => {
      const target = await users.create();
      expect(await unblockUser({ userId: target.id })).toEqual({ ok: true });
      expect(await auditFor(target.id)).toHaveLength(0);
    });

    it("can block another admin", async () => {
      const other = await makeAdmin("other");
      expect(await blockUser({ userId: other.id })).toEqual({ ok: true });
      expect((await getUserRow(other.id)).blockedAt).toBeInstanceOf(Date);
    });
  });

  describe("email verification", () => {
    it("verifies an unverified user, drops the pending link and records it", async () => {
      const target = await users.create({ verified: false });
      await getDb().insert(authTokens).values({
        userId: target.id,
        type: "email_verification",
        tokenHash: `pending-${target.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(await verifyUserEmail({ userId: target.id })).toEqual({ ok: true });
      expect((await getUserRow(target.id)).emailVerifiedAt).toBeInstanceOf(Date);
      expect(await getDb().select().from(authTokens).where(eq(authTokens.userId, target.id))).toHaveLength(0);
      expect((await auditFor(target.id)).map((e) => e.action)).toEqual(["email_verified"]);

      cookieJar.reset();
      expect(await redirectTarget(login({ email: target.email, password: target.password }))).toBe("/dashboard");
    });

    it("changes and logs nothing for an already verified user", async () => {
      const target = await users.create();
      const before = (await getUserRow(target.id)).emailVerifiedAt;
      expect(await verifyUserEmail({ userId: target.id })).toEqual({ ok: true });
      expect((await getUserRow(target.id)).emailVerifiedAt).toEqual(before);
      expect(await auditFor(target.id)).toHaveLength(0);
    });
  });

  describe("sessions", () => {
    it("signs a user out everywhere and records how many sessions", async () => {
      const target = await users.create();
      await createSession(target.id);
      await createSession(target.id);
      await signInAs(admin.id);

      expect(await revokeUserSessions({ userId: target.id })).toEqual({ ok: true });
      expect(await sessionCount(target.id)).toBe(0);
      expect((await auditFor(target.id))[0]).toMatchObject({ action: "sessions_revoked", detail: { count: 2 } });
    });

    it("signs out one device and leaves the others", async () => {
      const target = await users.create();
      await createSession(target.id);
      await createSession(target.id);
      await signInAs(admin.id);
      const [first] = await getDb().select().from(sessions).where(eq(sessions.userId, target.id));

      expect(await revokeUserSession({ userId: target.id, sessionId: first.id })).toEqual({ ok: true });
      expect(await sessionCount(target.id)).toBe(1);
      expect((await auditFor(target.id))[0].action).toBe("session_revoked");
    });

    it("will not sign out a session that belongs to someone else", async () => {
      const target = await users.create();
      const bystander = await users.create();
      await createSession(bystander.id);
      await signInAs(admin.id);
      const [theirs] = await getDb().select().from(sessions).where(eq(sessions.userId, bystander.id));

      expect(await revokeUserSession({ userId: target.id, sessionId: theirs.id })).toEqual({
        ok: false,
        error: "This session no longer exists.",
      });
      expect(await sessionCount(bystander.id)).toBe(1);
    });
  });

  describe("deleteUser", () => {
    it("needs the user's email typed exactly (case does not matter)", async () => {
      const target = await users.create();
      expect(await deleteUser({ userId: target.id, confirmEmail: "someone@else.local" })).toMatchObject({
        ok: false,
        fieldErrors: { confirmEmail: [expect.any(String)] },
      });
      expect(await getUserRow(target.id)).toBeDefined();

      expect(await deleteUser({ userId: target.id, confirmEmail: ` ${target.email.toUpperCase()} ` })).toEqual({ ok: true });
      expect(await getUserRow(target.id)).toBeUndefined();
    });

    it("wipes the user's data, keeps others' data, and keeps the audit row", async () => {
      const target = await users.create({ name: "Doomed" });
      const bystander = await users.create();
      await insertTransaction({
        userId: target.id,
        accountId: await defaultAccountId(target.id),
        type: "expense",
        amount: "5.00",
      });
      await createSession(target.id);
      await signInAs(admin.id);

      expect(await deleteUser({ userId: target.id, confirmEmail: target.email })).toEqual({ ok: true });

      expect(await getUserRow(target.id)).toBeUndefined();
      expect(await getDb().select().from(accounts).where(eq(accounts.userId, target.id))).toHaveLength(0);
      expect(await sessionCount(target.id)).toBe(0);
      expect(await getUserRow(bystander.id)).toBeDefined();
      const [entry] = await auditFor(target.id);
      expect(entry).toMatchObject({
        action: "deleted",
        targetEmail: target.email,
        detail: { name: "Doomed", role: "user", transfersRemoved: 0 },
      });
      expect(JSON.stringify(entry)).not.toMatch(/5\.00|passwordHash/);
    });

    it("removes transfers other people sent to the user's accounts and dissolves a household left with one person", async () => {
      const target = await users.create();
      const sender = await users.create();
      const [household] = await getDb().insert(households).values({}).returning();
      await getDb().insert(householdMembers).values([
        { householdId: household.id, userId: target.id },
        { householdId: household.id, userId: sender.id },
      ]);
      const [transfer] = await getDb()
        .insert(transfers)
        .values({
          userId: sender.id,
          fromAccountId: await defaultAccountId(sender.id),
          toAccountId: await defaultAccountId(target.id),
          amount: "10.00",
          date: "2026-10-01",
        })
        .returning({ id: transfers.id });

      expect(await deleteUser({ userId: target.id, confirmEmail: target.email })).toEqual({ ok: true });

      expect(await getDb().select().from(transfers).where(eq(transfers.id, transfer.id))).toHaveLength(0);
      expect(await getDb().select().from(households).where(eq(households.id, household.id))).toHaveLength(0);
      expect(await getUserRow(sender.id)).toBeDefined();
      expect((await auditFor(target.id))[0].detail).toMatchObject({ transfersRemoved: 1 });
    });

    it("keeps a household that still has two or more people", async () => {
      const [a, b, c] = [await users.create(), await users.create(), await users.create()];
      const [household] = await getDb().insert(households).values({}).returning();
      await getDb().insert(householdMembers).values([a, b, c].map((u) => ({ householdId: household.id, userId: u.id })));

      expect(await deleteUser({ userId: c.id, confirmEmail: c.email })).toEqual({ ok: true });
      expect(await getDb().select().from(householdMembers).where(eq(householdMembers.householdId, household.id))).toHaveLength(2);
      await getDb().delete(households).where(eq(households.id, household.id));
    });

    it("keeps an earlier audit row readable after the acting admin is deleted", async () => {
      const target = await users.create();
      await blockUser({ userId: target.id });
      const other = await makeAdmin("other");
      await signInAs(other.id);
      expect(await deleteUser({ userId: admin.id, confirmEmail: admin.email })).toEqual({ ok: true });

      const [entry] = await auditFor(target.id);
      expect(entry).toMatchObject({ action: "blocked", actorId: null, actorEmail: admin.email });
    });
  });
});
