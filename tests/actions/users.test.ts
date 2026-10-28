import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  authTokens,
  budgets,
  categories,
  sessions,
  tags,
  transactionTags,
  transactions,
  users,
} from "@/db/schema";
import { changePassword, deleteCurrentUser, updateProfile } from "@/lib/actions/users";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { createAuthToken } from "@/lib/auth/tokens";
import { cookieJar } from "../helpers/cookie-jar";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { getUserRow, useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

async function sessionCount(userId: string) {
  return (await getDb().select().from(sessions).where(eq(sessions.userId, userId))).length;
}

describe.skipIf(!TEST_DATABASE_URL)("user actions", () => {
  const users_ = useTestUsers();
  afterAll(users_.cleanup);

  describe("updateProfile", () => {
    it("requires a signed-in user", async () => {
      signOut();
      expect(await redirectTarget(updateProfile({ name: "x" }))).toBe("/login");
    });

    it("changes the name of the current user only", async () => {
      const ada = await users_.create({ name: "Ada" });
      const other = await users_.create({ name: "Other" });
      await signInAs(ada.id);
      expect(await updateProfile({ name: "  Ada Lovelace " })).toEqual({ ok: true });
      expect((await getUserRow(ada.id)).name).toBe("Ada Lovelace");
      expect((await getUserRow(other.id)).name).toBe("Other");
    });

    it("validates the name and leaves the email untouched", async () => {
      const ada = await users_.create({ name: "Ada" });
      await signInAs(ada.id);
      expect(await updateProfile({ name: "" })).toMatchObject({ ok: false, fieldErrors: { name: expect.any(Array) } });
      expect(await updateProfile({ name: "New", email: "evil@x.com" })).toEqual({ ok: true });
      expect((await getUserRow(ada.id)).email).toBe(ada.email);
    });
  });

  describe("changePassword", () => {
    const input = (current: string) => ({
      currentPassword: current,
      newPassword: "brand-new-pass-1",
      confirmPassword: "brand-new-pass-1",
    });

    it("requires a signed-in user", async () => {
      signOut();
      expect(await redirectTarget(changePassword(input("x")))).toBe("/login");
    });

    it("rejects a wrong current password and changes nothing", async () => {
      const user = await users_.create();
      await signInAs(user.id);
      const before = (await getUserRow(user.id)).passwordHash;
      expect(await changePassword(input("not-my-password"))).toMatchObject({
        ok: false,
        fieldErrors: { currentPassword: [expect.any(String)] },
      });
      expect((await getUserRow(user.id)).passwordHash).toBe(before);
    });

    it("validates the new password", async () => {
      const user = await users_.create();
      await signInAs(user.id);
      const result = await changePassword({ currentPassword: user.password, newPassword: "short", confirmPassword: "short" });
      expect(result).toMatchObject({ ok: false, fieldErrors: { newPassword: expect.any(Array) } });
    });

    it("sets the new password and signs out every OTHER session but keeps this one", async () => {
      const user = await users_.create();
      await createSession(user.id); // other device 1
      await createSession(user.id); // other device 2
      await signInAs(user.id); // this device (resets the jar, creates the 3rd session)
      expect(await sessionCount(user.id)).toBe(3);

      expect(await changePassword(input(user.password))).toEqual({ ok: true });

      const row = await getUserRow(user.id);
      expect(await verifyPassword("brand-new-pass-1", row.passwordHash)).toBe(true);
      expect(await verifyPassword(user.password, row.passwordHash)).toBe(false);
      expect(await sessionCount(user.id)).toBe(1);
      expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
      // The surviving session is still valid for this device.
      expect(await changePassword({ ...input("brand-new-pass-1"), newPassword: "another-pass-22", confirmPassword: "another-pass-22" })).toEqual({ ok: true });
    });

    it("never changes another user's password", async () => {
      const mine = await users_.create();
      const theirs = await users_.create();
      await signInAs(mine.id);
      const before = (await getUserRow(theirs.id)).passwordHash;
      await changePassword(input(mine.password));
      expect((await getUserRow(theirs.id)).passwordHash).toBe(before);
    });
  });

  describe("deleteCurrentUser", () => {
    it("requires a signed-in user", async () => {
      signOut();
      expect(await redirectTarget(deleteCurrentUser({ password: "x" }))).toBe("/login");
    });

    it("needs the right password: a wrong one deletes nothing", async () => {
      const user = await users_.create();
      await signInAs(user.id);
      expect(await deleteCurrentUser({ password: "wrong-password" })).toMatchObject({
        ok: false,
        fieldErrors: { password: [expect.any(String)] },
      });
      expect(await deleteCurrentUser({ password: "" })).toMatchObject({ ok: false });
      expect(await getUserRow(user.id)).toBeDefined();
      expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
    });

    it("deletes the user and every row they own, clears the cookie, and redirects to /login", async () => {
      const bystander = await users_.create({ label: "bystander" });
      const user = await users_.create({ label: "doomed" });
      await signInAs(user.id);

      const account = await defaultAccountId(user.id);
      const [txn] = await getDb()
        .insert(transactions)
        .values({ userId: user.id, accountId: account, type: "expense", amount: "9.99", date: "2026-02-01", categoryId: await categoryIdByName(user.id, "Rent") })
        .returning({ id: transactions.id });
      const [tag] = await getDb().insert(tags).values({ userId: user.id, name: "t" }).returning({ id: tags.id });
      await getDb().insert(transactionTags).values({ transactionId: txn.id, tagId: tag.id });
      await getDb().insert(budgets).values({ userId: user.id, categoryId: await categoryIdByName(user.id, "Groceries"), amount: "100.00" });
      await createAuthToken(user.id, "password_reset");

      expect(await redirectTarget(deleteCurrentUser({ password: user.password }))).toBe("/login");

      expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
      const left = await Promise.all([
        getDb().select().from(users).where(eq(users.id, user.id)),
        getDb().select().from(accounts).where(eq(accounts.userId, user.id)),
        getDb().select().from(categories).where(eq(categories.userId, user.id)),
        getDb().select().from(tags).where(eq(tags.userId, user.id)),
        getDb().select().from(transactions).where(eq(transactions.userId, user.id)),
        getDb().select().from(transactionTags).where(eq(transactionTags.transactionId, txn.id)),
        getDb().select().from(budgets).where(eq(budgets.userId, user.id)),
        getDb().select().from(sessions).where(eq(sessions.userId, user.id)),
        getDb().select().from(authTokens).where(eq(authTokens.userId, user.id)),
      ]);
      expect(left.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);

      // Other users are untouched.
      expect(await getUserRow(bystander.id)).toBeDefined();
      expect((await getDb().select().from(accounts).where(eq(accounts.userId, bystander.id))).length).toBe(1);
    });
  });
});
