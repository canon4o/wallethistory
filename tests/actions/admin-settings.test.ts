import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLog, announcements, appSettings, users as usersTable } from "@/db/schema";
import { clearAnnouncement, publishAnnouncement, setSignupEnabled } from "@/lib/actions/admin";
import { isSignupEnabled, SIGNUP_ENABLED_KEY } from "@/lib/auth/settings";
import { getActiveAnnouncement, listAnnouncementHistory } from "@/lib/data/announcements";
import { cookieJar } from "../helpers/cookie-jar";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe.skipIf(!TEST_DATABASE_URL)("admin settings and announcements", () => {
  const users = useTestUsers();
  let admin: { id: string; email: string };

  async function actionsBy(adminId: string, action: string) {
    return getDb()
      .select()
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.actorId, adminId), eq(adminAuditLog.action, action as "blocked")))
      .orderBy(desc(adminAuditLog.createdAt));
  }

  beforeEach(async () => {
    admin = await users.create({ label: "admin" });
    await getDb().update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, admin.id));
    await signInAs(admin.id);
    // Only one banner is active at a time, and the table is shared: start from none.
    await getDb().delete(announcements); // the history lists every banner, so start from none
  });
  afterAll(async () => {
    // Leave the shared database the way every other test file expects it.
    await getDb().delete(appSettings).where(eq(appSettings.key, SIGNUP_ENABLED_KEY));
    await getDb().delete(announcements); // the history lists every banner, so start from none
    await users.cleanup();
  });

  describe("signup switch", () => {
    it("is on when nothing is stored", async () => {
      await getDb().delete(appSettings).where(eq(appSettings.key, SIGNUP_ENABLED_KEY));
      expect(await isSignupEnabled()).toBe(true);
    });

    it("turns signups off and on, and records both", async () => {
      expect(await setSignupEnabled({ enabled: false })).toEqual({ ok: true });
      expect(await isSignupEnabled()).toBe(false);
      expect(await setSignupEnabled({ enabled: true })).toEqual({ ok: true });
      expect(await isSignupEnabled()).toBe(true);
      expect((await actionsBy(admin.id, "signup_disabled")).length).toBe(1);
      expect((await actionsBy(admin.id, "signup_enabled")).length).toBe(1);
    });

    it("treats a malformed stored value as on", async () => {
      await getDb()
        .insert(appSettings)
        .values({ key: SIGNUP_ENABLED_KEY, value: "no" })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: "no" } });
      expect(await isSignupEnabled()).toBe(true);
    });

    it("validates its input and answers 404 to a regular user", async () => {
      expect(await setSignupEnabled({ enabled: "yes" })).toMatchObject({ ok: false });
      const regular = await users.create();
      await signInAs(regular.id);
      await expect(setSignupEnabled({ enabled: false })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      expect(await isSignupEnabled()).toBe(true);
    });
  });

  describe("announcement", () => {
    it("publishes a banner for signed-in users and records it", async () => {
      expect(await publishAnnouncement({ message: "  Maintenance tonight  ", level: "warning" })).toEqual({ ok: true });
      const current = await getActiveAnnouncement();
      expect(current).toMatchObject({ message: "Maintenance tonight", level: "warning" });
      const [entry] = await actionsBy(admin.id, "announcement_published");
      expect(entry.detail).toEqual({ message: "Maintenance tonight", level: "warning" });
    });

    it("replaces the previous banner: only one is ever active", async () => {
      await publishAnnouncement({ message: "First", level: "info" });
      const first = await getActiveAnnouncement();
      await publishAnnouncement({ message: "Second", level: "info" });
      const second = await getActiveAnnouncement();
      expect(second?.message).toBe("Second");
      expect(second?.id).not.toBe(first?.id);
      expect(await getDb().select().from(announcements).where(eq(announcements.active, true))).toHaveLength(1);
    });

    it("keeps the message plain text within the limit", async () => {
      expect(await publishAnnouncement({ message: "   ", level: "info" })).toMatchObject({
        ok: false,
        fieldErrors: { message: [expect.any(String)] },
      });
      expect(await publishAnnouncement({ message: "x".repeat(281), level: "info" })).toMatchObject({ ok: false });
      expect(await publishAnnouncement({ message: "ok", level: "loud" })).toMatchObject({ ok: false });
      expect(await getActiveAnnouncement()).toBeNull();
      // Stored as text and rendered as text by React: markup is never interpreted.
      await publishAnnouncement({ message: "<script>alert(1)</script>", level: "info" });
      expect((await getActiveAnnouncement())?.message).toBe("<script>alert(1)</script>");
    });

    it("lists every banner newest first, flagging the active one, for admins only", async () => {
      expect(await listAnnouncementHistory()).toEqual([]);
      await publishAnnouncement({ message: "First", level: "info" });
      await publishAnnouncement({ message: "Second", level: "warning" });
      const history = await listAnnouncementHistory();
      expect(history.map((row) => [row.message, row.active, row.createdByEmail])).toEqual([
        ["Second", true, admin.email],
        ["First", false, admin.email],
      ]);
      await clearAnnouncement();
      expect((await listAnnouncementHistory()).every((row) => !row.active)).toBe(true);
      const regular = await users.create();
      await signInAs(regular.id);
      await expect(listAnnouncementHistory()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    });

    it("clears the banner and records it only when there was one", async () => {
      await clearAnnouncement();
      expect(await actionsBy(admin.id, "announcement_cleared")).toHaveLength(0);

      await publishAnnouncement({ message: "Hello", level: "info" });
      expect(await clearAnnouncement()).toEqual({ ok: true });
      expect(await getActiveAnnouncement()).toBeNull();
      expect(await actionsBy(admin.id, "announcement_cleared")).toHaveLength(1);
    });

    it("is readable by any signed-in user but not by a visitor, and only admins can change it", async () => {
      await publishAnnouncement({ message: "Hi all", level: "info" });
      const regular = await users.create();
      await signInAs(regular.id);
      expect((await getActiveAnnouncement())?.message).toBe("Hi all");
      await expect(publishAnnouncement({ message: "x", level: "info" })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      await expect(clearAnnouncement()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      cookieJar.reset();
      await expect(getActiveAnnouncement()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    });
  });
});
