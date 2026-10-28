import { describe, expect, it } from "vitest";
import { BCRYPT_COST, hashPassword, verifyPassword, verifyPasswordOrDummy } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes with bcrypt cost 12 and never stores the plain password", async () => {
    const hash = await hashPassword("correct horse");
    expect(BCRYPT_COST).toBe(12);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toContain("correct horse");
  });

  it("uses a fresh salt for every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it("verifies the pgcrypto $2a$ hash created by the admin seed migration", async () => {
    // Generated with extensions.crypt('adminpass', extensions.gen_salt('bf', 12)).
    const seeded = "$2a$12$yHOXjcD4C0qrTBHPK0gpMen47UCm5liQgUonF/v25hThjiNGLZfEq";
    expect(await verifyPassword("adminpass", seeded)).toBe(true);
    expect(await verifyPassword("wrong", seeded)).toBe(false);
  });

  it("verifyPasswordOrDummy matches real hashes and always fails for unknown users", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPasswordOrDummy("secret123", hash)).toBe(true);
    expect(await verifyPasswordOrDummy("nope", hash)).toBe(false);
    expect(await verifyPasswordOrDummy("secret123", null)).toBe(false);
    expect(await verifyPasswordOrDummy("secret123", undefined)).toBe(false);
  });

  it("spends comparable time for unknown users (no cheap path)", async () => {
    const hash = await hashPassword("secret123");
    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };
    const known = await time(() => verifyPasswordOrDummy("x", hash));
    const unknown = await time(() => verifyPasswordOrDummy("x", null));
    expect(unknown).toBeGreaterThan(known * 0.3);
  });
});
