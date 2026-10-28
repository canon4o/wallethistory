import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authTokens } from "@/db/schema";
import { consumeAuthToken, createAuthToken, generateToken, hashToken } from "@/lib/auth/tokens";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe("token generation", () => {
  it("generates unique base64url tokens of 32 bytes", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("hashes with SHA-256 hex, deterministically", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
});

describe.skipIf(!TEST_DATABASE_URL)("one-time email tokens", () => {
  const users = useTestUsers();
  let userId: string;

  beforeAll(async () => {
    userId = (await users.create({ label: "tokens" })).id;
  });
  afterAll(users.cleanup);

  async function rowFor(token: string) {
    const [row] = await getDb().select().from(authTokens).where(eq(authTokens.tokenHash, hashToken(token)));
    return row;
  }

  it("stores only the hash, never the raw token", async () => {
    const token = await createAuthToken(userId, "email_verification");
    const row = await rowFor(token);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(row.usedAt).toBeNull();
  });

  it("expires verification tokens in 24 hours and reset tokens in 1 hour", async () => {
    const verification = await rowFor(await createAuthToken(userId, "email_verification"));
    const reset = await rowFor(await createAuthToken(userId, "password_reset"));
    const hours = (row: { expiresAt: Date }) => (row.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours(verification)).toBeGreaterThan(23.9);
    expect(hours(verification)).toBeLessThanOrEqual(24);
    expect(hours(reset)).toBeGreaterThan(0.9);
    expect(hours(reset)).toBeLessThanOrEqual(1);
  });

  it("is single-use", async () => {
    const token = await createAuthToken(userId, "password_reset");
    expect(await consumeAuthToken(token, "password_reset")).toBe(userId);
    expect(await consumeAuthToken(token, "password_reset")).toBeNull();
    expect((await rowFor(token)).usedAt).not.toBeNull();
  });

  it("rejects unknown tokens and tokens of another type", async () => {
    expect(await consumeAuthToken("not-a-token", "password_reset")).toBeNull();
    const token = await createAuthToken(userId, "email_verification");
    expect(await consumeAuthToken(token, "password_reset")).toBeNull();
    expect(await consumeAuthToken(token, "email_verification")).toBe(userId);
  });

  it("rejects expired tokens", async () => {
    const token = await createAuthToken(userId, "password_reset");
    await getDb()
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.tokenHash, hashToken(token)));
    expect(await consumeAuthToken(token, "password_reset")).toBeNull();
  });

  it("invalidates older unused tokens of the same type when a new one is issued", async () => {
    const first = await createAuthToken(userId, "password_reset");
    const other = await createAuthToken(userId, "email_verification");
    const second = await createAuthToken(userId, "password_reset");
    expect(await consumeAuthToken(first, "password_reset")).toBeNull();
    expect(await consumeAuthToken(second, "password_reset")).toBe(userId);
    // A token of another type is untouched.
    expect(await consumeAuthToken(other, "email_verification")).toBe(userId);
  });
});
