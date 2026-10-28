import { describe, expect, it } from "vitest";
import { RedisAdapter } from "@/lib/cache/adapter";

// Runs only when REDIS_URL_TEST points at a disposable Redis server.
describe.skipIf(!process.env.REDIS_URL_TEST)("RedisAdapter against a real server", () => {
  it("round-trips values, counters and locks", async () => {
    const store = new RedisAdapter(process.env.REDIS_URL_TEST!);
    const key = `wh-test:${crypto.randomUUID()}`;
    await store.set(key, "v", 5);
    expect(await store.get(key)).toBe("v");
    expect(await store.mget([key, `${key}:none`])).toEqual(["v", null]);
    expect(await store.incrWithTtl(`${key}:w`, 5)).toBe(1);
    expect(await store.incrWithTtl(`${key}:w`, 5)).toBe(2);
    expect(await store.incr(`${key}:n`)).toBe(1);
    expect(await store.setIfAbsent(`${key}:lock`, "1", 5)).toBe(true);
    expect(await store.setIfAbsent(`${key}:lock`, "1", 5)).toBe(false);
    await store.del(key);
    expect(await store.get(key)).toBeNull();
    for (const suffix of [":n", ":lock"]) await store.del(key + suffix);
  });
});
