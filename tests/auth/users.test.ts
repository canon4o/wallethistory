import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { createSession } from "@/lib/auth/session";
import {
  createUser,
  findUserByEmail,
  findUserById,
  markEmailVerified,
  resetUserPassword,
} from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { getUserRow, useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe.skipIf(!TEST_DATABASE_URL)("user helpers", () => {
  const users = useTestUsers();
  afterAll(users.cleanup);

  it("creates a user with a bcrypt hash and the default account and categories", async () => {
    const { id, password } = await users.create({ verified: false });
    const row = await getUserRow(id);
    expect(row.passwordHash).not.toBe(password);
    expect(await verifyPassword(password, row.passwordHash)).toBe(true);
    expect(row.emailVerifiedAt).toBeNull();
  });

  it("creates verified users with a verification date", async () => {
    const { id } = await users.create({ verified: true });
    expect((await getUserRow(id)).emailVerifiedAt).not.toBeNull();
  });

  it("refuses a duplicate email regardless of case", async () => {
    const first = await users.create({ label: "dup" });
    const result = await createUser({
      name: "Other",
      email: first.email.toUpperCase(),
      password: "password123",
      verified: true,
    });
    expect(result).toEqual({ ok: false, reason: "email_taken" });
  });

  it("rethrows unexpected database errors", async () => {
    await expect(
      createUser({ name: "x".repeat(101), email: `long-${crypto.randomUUID()}@test.local`, password: "password123", verified: true }),
    ).rejects.toThrow();
  });

  it("finds users by email case-insensitively and by id", async () => {
    const { id, email } = await users.create({ name: "Finder" });
    expect((await findUserByEmail(email.toUpperCase()))?.id).toBe(id);
    expect((await findUserById(id))?.name).toBe("Finder");
    expect(await findUserByEmail("nobody@test.local")).toBeNull();
    expect(await findUserById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("marks an email as verified", async () => {
    const { id } = await users.create({ verified: false });
    await markEmailVerified(id);
    expect((await getUserRow(id)).emailVerifiedAt).not.toBeNull();
  });

  it("resetting a password changes the hash and deletes all of the user's sessions", async () => {
    const { id } = await users.create();
    await createSession(id);
    await createSession(id);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(2);

    await resetUserPassword(id, "brand-new-password");
    const row = await getUserRow(id);
    expect(await verifyPassword("brand-new-password", row.passwordHash)).toBe(true);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
  });
});
