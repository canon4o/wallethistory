import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryAdapter,
  NoopAdapter,
  RedisAdapter,
  type CacheAdapter,
} from "@/lib/cache/adapter";
import { bumpUsers, cached, cachedGlobal, invalidateGlobal, setCacheAdapter, shouldRunCatchUp } from "@/lib/cache";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

/** A store that always fails, like an unreachable Redis. */
class BrokenAdapter implements CacheAdapter {
  async get(): Promise<string | null> {
    throw new Error("down");
  }
  async mget(): Promise<Array<string | null>> {
    throw new Error("down");
  }
  async set(): Promise<void> {
    throw new Error("down");
  }
  async setIfAbsent(): Promise<boolean> {
    throw new Error("down");
  }
  async incr(): Promise<number> {
    throw new Error("down");
  }
  async incrWithTtl(): Promise<number> {
    throw new Error("down");
  }
  async del(): Promise<void> {
    throw new Error("down");
  }
}

describe("cached", () => {
  let store: MemoryAdapter;
  beforeEach(() => {
    store = new MemoryAdapter();
    setCacheAdapter(store);
  });
  afterEach(() => {
    setCacheAdapter(undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads once and then serves the stored value", async () => {
    const load = vi.fn(async () => ({ total: "10.00" }));
    const options = { name: "t", memberIds: [A], args: { range: 1 } };
    expect(await cached(options, load)).toEqual({ total: "10.00" });
    expect(await cached(options, load)).toEqual({ total: "10.00" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps different arguments and different functions apart", async () => {
    const load = vi.fn(async () => 1);
    await cached({ name: "t", memberIds: [A], args: 1 }, load);
    await cached({ name: "t", memberIds: [A], args: 2 }, load);
    await cached({ name: "u", memberIds: [A], args: 1 }, load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("never serves one household's value to another", async () => {
    await cached({ name: "t", memberIds: [A], args: 1 }, async () => "a");
    expect(await cached({ name: "t", memberIds: [B], args: 1 }, async () => "b")).toBe("b");
  });

  it("is refreshed by a bump of any household member", async () => {
    const options = { name: "t", memberIds: [A, B], args: 1 };
    let value = 1;
    expect(await cached(options, async () => value)).toBe(1);
    value = 2;
    expect(await cached(options, async () => value)).toBe(1);
    await bumpUsers([B]);
    expect(await cached(options, async () => value)).toBe(2);
  });

  it("does not depend on the order of member ids", async () => {
    const load = vi.fn(async () => 1);
    await cached({ name: "t", memberIds: [A, B], args: 1 }, load);
    await cached({ name: "t", memberIds: [B, A], args: 1 }, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("is not refreshed by someone outside the household", async () => {
    const load = vi.fn(async () => 1);
    await cached({ name: "t", memberIds: [A], args: 1 }, load);
    await bumpUsers([C]);
    await cached({ name: "t", memberIds: [A], args: 1 }, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("expires after its TTL", async () => {
    let now = 1_000_000;
    setCacheAdapter(new MemoryAdapter(() => now));
    const load = vi.fn(async () => 1);
    const options = { name: "t", memberIds: [A], ttlSeconds: 10 };
    await cached(options, load);
    now += 12_000;
    await cached(options, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not store a failed load", async () => {
    const options = { name: "t", memberIds: [A] };
    await expect(cached(options, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await cached(options, async () => "ok")).toBe("ok");
  });

  it("revives values JSON cannot hold", async () => {
    const options = {
      name: "t",
      memberIds: [A],
      revive: (json: unknown) => new Date((json as { at: string }).at),
    };
    await cached({ ...options, revive: undefined }, async () => ({ at: "2026-01-01T00:00:00.000Z" }));
    const again = await cached(options, async () => new Date(0));
    expect(again).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("runs a burst of identical misses once", async () => {
    const load = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 1;
    });
    const options = { name: "t", memberIds: [A] };
    await Promise.all([cached(options, load), cached(options, load), cached(options, load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("replaces a corrupt entry", async () => {
    const options = { name: "t", memberIds: [A] };
    await cached(options, async () => 1);
    // Overwrite every data key with garbage.
    const raw = store as unknown as { entries: Map<string, { value: string; expiresAt: number | null }> };
    for (const [key, entry] of raw.entries) if (key.includes(":d:")) entry.value = "{not json";
    expect(await cached(options, async () => 2)).toBe(2);
  });

  it("skips the cache without a store", async () => {
    setCacheAdapter(new NoopAdapter());
    const load = vi.fn(async () => 1);
    await cached({ name: "t", memberIds: [A] }, load);
    await cached({ name: "t", memberIds: [A] }, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("when the store is down", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setCacheAdapter(new BrokenAdapter());
  });
  afterEach(() => {
    setCacheAdapter(undefined);
    vi.restoreAllMocks();
  });

  it("still returns the loaded value", async () => {
    expect(await cached({ name: "t", memberIds: [A] }, async () => 7)).toBe(7);
    expect(await cachedGlobal("g", 60, async () => 8)).toBe(8);
  });

  it("stops asking after repeated failures", async () => {
    const mget = vi.spyOn(BrokenAdapter.prototype, "mget");
    for (let i = 0; i < 6; i++) await cached({ name: "t", memberIds: [A] }, async () => i);
    expect(mget.mock.calls.length).toBeLessThan(6);
  });

  it("runs the catch-up when the gate cannot be checked", async () => {
    expect(await shouldRunCatchUp(A)).toBe(true);
  });

  it("does not throw when a version cannot be bumped", async () => {
    await expect(bumpUsers([A])).resolves.toBeUndefined();
  });
});

describe("a lost version bump", () => {
  afterEach(() => {
    setCacheAdapter(undefined);
    vi.restoreAllMocks();
  });

  it("makes reads skip the cache for a while", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new MemoryAdapter();
    setCacheAdapter(store);
    const load = vi.fn(async () => 1);
    await cached({ name: "t", memberIds: [A] }, load);
    vi.spyOn(store, "incr").mockRejectedValue(new Error("lost"));
    await bumpUsers([A]);
    await cached({ name: "t", memberIds: [A] }, load);
    await cached({ name: "t", memberIds: [A] }, load);
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe("global values and the catch-up gate", () => {
  beforeEach(() => setCacheAdapter(new MemoryAdapter()));
  afterEach(() => setCacheAdapter(undefined));

  it("caches a global value until it is invalidated", async () => {
    let value = "one";
    expect(await cachedGlobal("g", 60, async () => value)).toBe("one");
    value = "two";
    expect(await cachedGlobal("g", 60, async () => value)).toBe("one");
    await invalidateGlobal("g");
    expect(await cachedGlobal("g", 60, async () => value)).toBe("two");
  });

  it("lets the catch-up run once per window, and again after a write", async () => {
    expect(await shouldRunCatchUp(A)).toBe(true);
    expect(await shouldRunCatchUp(A)).toBe(false);
    await bumpUsers([A]);
    expect(await shouldRunCatchUp(A)).toBe(true);
  });

  it("ignores an empty bump", async () => {
    await expect(bumpUsers([])).resolves.toBeUndefined();
  });
});

describe("adapters", () => {
  it("memory: mget, setIfAbsent, incr, del and expiry", async () => {
    let now = 0;
    const store: CacheAdapter & { size(): number } = new MemoryAdapter(() => now);
    await store.set("a", "1", 5);
    expect(await store.mget(["a", "b"])).toEqual(["1", null]);
    expect(await store.setIfAbsent("a", "2", 5)).toBe(false);
    expect(await store.setIfAbsent("b", "2", 5)).toBe(true);
    expect(await store.incr("n")).toBe(1);
    expect(await store.incr("n")).toBe(2);
    await store.del("a");
    expect(await store.get("a")).toBeNull();
    expect(store.size()).toBe(2);
    now = 6_000;
    expect(await store.get("b")).toBeNull();
  });

  it("memory: incrWithTtl counts inside a window and starts over after it", async () => {
    let now = 0;
    const store = new MemoryAdapter(() => now);
    expect(await store.incrWithTtl("w", 10)).toBe(1);
    now = 9_000;
    expect(await store.incrWithTtl("w", 10)).toBe(2);
    now = 10_000;
    expect(await store.incrWithTtl("w", 10)).toBe(1);
  });

  it("noop: reads miss and writes vanish", async () => {
    const store = new NoopAdapter();
    expect(await store.get()).toBeNull();
    expect(await store.mget(["a"])).toEqual([null]);
    expect(await store.setIfAbsent()).toBe(true);
    expect(await store.incr()).toBe(0);
    expect(await store.incrWithTtl()).toBe(0);
    await store.set();
    await store.del();
  });

  it("redis over TCP: maps each call to the client", async () => {
    const redis = {
      get: vi.fn(async () => "v"),
      mget: vi.fn(async () => ["v", null]),
      set: vi.fn(async (...args: unknown[]) => (args.includes("NX") ? null : "OK")),
      incr: vi.fn(async () => 2),
      expire: vi.fn(async () => 1),
      del: vi.fn(async () => 1),
    };
    const store = new RedisAdapter("redis://localhost", redis as never);
    expect(await store.get("a")).toBe("v");
    expect(await store.mget(["a", "b"])).toEqual(["v", null]);
    expect(await store.mget([])).toEqual([]);
    await store.set("a", "v", 10);
    expect(redis.set).toHaveBeenCalledWith("a", "v", "EX", 10);
    expect(await store.setIfAbsent("a", "v", 10)).toBe(false);
    expect(await store.incr("a")).toBe(2);
    // The TTL is only set when the window starts (count 1), never renewed by later hits.
    expect(await store.incrWithTtl("a", 60)).toBe(2);
    expect(redis.expire).not.toHaveBeenCalled();
    redis.incr.mockResolvedValueOnce(1);
    expect(await store.incrWithTtl("b", 60)).toBe(1);
    expect(redis.expire).toHaveBeenCalledWith("b", 60);
    await store.del("a");
  });

  it("redis over TCP: fails fast when the server is unreachable", async () => {
    const store = new RedisAdapter("redis://default:secret@127.0.0.1:1");
    expect(store).toBeInstanceOf(RedisAdapter);
    // Nothing listens there: the command fails within the timeout instead of hanging.
    await expect(store.get("a")).rejects.toThrow();
    void (store as unknown as { redis: { disconnect(): void } }).redis.disconnect();
  });
});
