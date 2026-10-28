import { afterAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLog, householdMembers, households, users as usersTable } from "@/db/schema";
import { updateUserRegionalSettings } from "@/lib/actions/admin";
import { updateRegionalSettings } from "@/lib/actions/users";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { getUserRow, useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe.skipIf(!TEST_DATABASE_URL)("regional settings", () => {
  const users = useTestUsers();
  afterAll(users.cleanup);

  async function makeAdmin() {
    const user = await users.create({ label: "admin" });
    await getDb().update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, user.id));
    return user;
  }

  const auditFor = (targetId: string) =>
    getDb().select().from(adminAuditLog).where(eq(adminAuditLog.targetUserId, targetId)).orderBy(desc(adminAuditLog.createdAt));

  describe("updateRegionalSettings (own account)", () => {
    it("requires a signed-in user", async () => {
      signOut();
      expect(await redirectTarget(updateRegionalSettings({ currency: "EUR", timezone: "UTC" }))).toBe("/login");
    });

    it("new users default to USD and UTC", async () => {
      const ada = await users.create();
      expect(await getUserRow(ada.id)).toMatchObject({ currency: "USD", timezone: "UTC" });
    });

    it("changes the currency and timezone of the current user only, and normalizes the timezone", async () => {
      const ada = await users.create();
      const other = await users.create();
      await signInAs(ada.id);
      expect(await updateRegionalSettings({ currency: "EUR", timezone: "europe/sofia" })).toEqual({ ok: true });
      expect(await getUserRow(ada.id)).toMatchObject({ currency: "EUR", timezone: "Europe/Sofia" });
      expect(await getUserRow(other.id)).toMatchObject({ currency: "USD", timezone: "UTC" });
    });

    it("can be changed back at any time", async () => {
      const ada = await users.create({ currency: "EUR", timezone: "Asia/Tokyo" });
      await signInAs(ada.id);
      expect(await updateRegionalSettings({ currency: "USD", timezone: "UTC" })).toEqual({ ok: true });
      expect(await getUserRow(ada.id)).toMatchObject({ currency: "USD", timezone: "UTC" });
    });

    it("is allowed while sharing a household, whatever the other members use", async () => {
      const ann = await users.create({ currency: "USD" });
      const ben = await users.create({ currency: "USD" });
      const [household] = await getDb().insert(households).values({}).returning({ id: households.id });
      await getDb().insert(householdMembers).values([
        { householdId: household.id, userId: ann.id },
        { householdId: household.id, userId: ben.id },
      ]);
      await signInAs(ann.id);
      expect(await updateRegionalSettings({ currency: "EUR", timezone: "UTC" })).toEqual({ ok: true });
      expect((await getUserRow(ann.id)).currency).toBe("EUR");
      expect((await getUserRow(ben.id)).currency).toBe("USD");
      await getDb().delete(households).where(eq(households.id, household.id));
    });

    it("rejects unknown values with field errors and changes nothing", async () => {
      const ada = await users.create({ currency: "EUR", timezone: "Asia/Tokyo" });
      await signInAs(ada.id);
      const result = await updateRegionalSettings({ currency: "CHF", timezone: "Mars/Olympus" });
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { currency: expect.any(Array), timezone: expect.any(Array) },
      });
      expect(await getUserRow(ada.id)).toMatchObject({ currency: "EUR", timezone: "Asia/Tokyo" });
    });

    it("ignores a user id in the input", async () => {
      const ada = await users.create();
      const other = await users.create();
      await signInAs(ada.id);
      await updateRegionalSettings({ currency: "EUR", timezone: "UTC", userId: other.id });
      expect((await getUserRow(other.id)).currency).toBe("USD");
    });
  });

  describe("updateUserRegionalSettings (admin)", () => {
    it("answers 404 to a regular user and changes nothing", async () => {
      const regular = await users.create();
      const target = await users.create();
      await signInAs(regular.id);
      await expect(
        updateUserRegionalSettings({ userId: target.id, currency: "EUR", timezone: "Asia/Tokyo" }),
      ).rejects.toThrow();
      expect(await getUserRow(target.id)).toMatchObject({ currency: "USD", timezone: "UTC" });
    });

    it("changes a user's settings and writes one audit row with the old and new values", async () => {
      const admin = await makeAdmin();
      const target = await users.create();
      await signInAs(admin.id);
      expect(
        await updateUserRegionalSettings({ userId: target.id, currency: "EUR", timezone: "europe/sofia" }),
      ).toEqual({ ok: true });
      expect(await getUserRow(target.id)).toMatchObject({ currency: "EUR", timezone: "Europe/Sofia" });
      const [row, ...rest] = await auditFor(target.id);
      expect(rest).toHaveLength(0);
      expect(row).toMatchObject({
        action: "regional_settings_changed",
        actorId: admin.id,
        targetEmail: target.email,
        detail: { currency: { from: "USD", to: "EUR" }, timezone: { from: "UTC", to: "Europe/Sofia" } },
      });
    });

    it("writes no audit row when nothing changes", async () => {
      const admin = await makeAdmin();
      const target = await users.create({ currency: "EUR", timezone: "Asia/Tokyo" });
      await signInAs(admin.id);
      expect(await updateUserRegionalSettings({ userId: target.id, currency: "EUR", timezone: "Asia/Tokyo" })).toEqual({ ok: true });
      expect(await auditFor(target.id)).toHaveLength(0);
    });

    it("validates the input", async () => {
      const admin = await makeAdmin();
      const target = await users.create();
      await signInAs(admin.id);
      expect(await updateUserRegionalSettings({ userId: target.id, currency: "CHF", timezone: "UTC" })).toMatchObject({
        ok: false,
        fieldErrors: { currency: expect.any(Array) },
      });
      expect(await updateUserRegionalSettings({ userId: "nope", currency: "EUR", timezone: "UTC" })).toMatchObject({ ok: false });
      expect(await getUserRow(target.id)).toMatchObject({ currency: "USD", timezone: "UTC" });
    });

    it("reports a missing user and refuses to edit the admin's own account here", async () => {
      const admin = await makeAdmin();
      await signInAs(admin.id);
      expect(
        await updateUserRegionalSettings({ userId: crypto.randomUUID(), currency: "EUR", timezone: "UTC" }),
      ).toMatchObject({ ok: false, error: "This user no longer exists." });
      expect(await updateUserRegionalSettings({ userId: admin.id, currency: "EUR", timezone: "UTC" })).toMatchObject({
        ok: false,
      });
    });
  });
});
