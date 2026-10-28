import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postgresMock = vi.fn(() => ({ fake: "client" }));
const drizzleMock = vi.fn(() => ({ fake: "db" }));
vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: drizzleMock }));

const globalCache = globalThis as { __walletHistoryDb?: unknown };

describe("getDb", () => {
  beforeEach(() => {
    vi.resetModules();
    postgresMock.mockClear();
    drizzleMock.mockClear();
    delete globalCache.__walletHistoryDb;
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete globalCache.__walletHistoryDb;
  });

  it("does not need env vars until it is called", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("@/db")).resolves.toBeDefined();
    expect(postgresMock).not.toHaveBeenCalled();
  });

  it("creates one client with prepared statements disabled and reuses it", async () => {
    const { getDb } = await import("@/db");
    const first = getDb();
    const second = getDb();
    expect(second).toBe(first);
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith("postgres://u:p@localhost:5432/db", {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    expect(drizzleMock).toHaveBeenCalledTimes(1);
  });

  it("survives module reloads (hot reload) without opening a second client", async () => {
    const first = (await import("@/db")).getDb();
    vi.resetModules();
    const second = (await import("@/db")).getDb();
    expect(second).toBe(first);
    expect(postgresMock).toHaveBeenCalledTimes(1);
  });
});
