import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { MemoryAdapter, NoopAdapter, RedisAdapter, type CacheAdapter } from "./adapter";

// Server-only. A read-through cache in front of expensive reads.
//
// Freshness does not depend on deleting keys. Every user has a version number; a cache key contains
// the versions of everyone the reader can see (their household), and any write bumps the writer's
// version, so older keys simply stop being asked for and expire by TTL. A short TTL is the safety
// net for a write that forgot to bump.
//
// The cache must never break the app: every failure falls back to the loader.

const KEY_VERSION = 1;
const COMMAND_TIMEOUT_MS = 250;
const BREAKER_THRESHOLD = 3;
const BREAKER_PAUSE_MS = 20_000;
/** After a lost version bump, reads skip the cache for this long. */
const UNTRUSTED_MS = 60_000;

export const TTL = {
  /** Reports, dashboard aggregates, accounts, budgets, goals. */
  data: 600,
  announcement: 60,
  admin: 60,
  materializeGate: 300,
} as const;

type State = {
  adapter?: CacheAdapter;
  failures: number;
  pausedUntil: number;
  untrustedUntil: number;
  inFlight: Map<string, Promise<unknown>>;
  hits: number;
  misses: number;
};

const globalState = globalThis as typeof globalThis & { __walletHistoryCache?: State };
const state: State = (globalState.__walletHistoryCache ??= {
  failures: 0,
  pausedUntil: 0,
  untrustedUntil: 0,
  inFlight: new Map(),
  hits: 0,
  misses: 0,
});

function adapter(): CacheAdapter {
  if (!state.adapter) {
    const env = getEnv();
    state.adapter = env.REDIS_URL ? new RedisAdapter(env.REDIS_URL) : new NoopAdapter();
  }
  return state.adapter;
}

/** Tests: use a specific store (or `undefined` to go back to the environment's) and reset all state. */
export function setCacheAdapter(next: CacheAdapter | undefined): void {
  state.adapter = next;
  state.failures = 0;
  state.pausedUntil = 0;
  state.untrustedUntil = 0;
  state.inFlight.clear();
  state.hits = 0;
  state.misses = 0;
}

export { MemoryAdapter };

export function cacheStats() {
  return { hits: state.hits, misses: state.misses, paused: Date.now() < state.pausedUntil };
}

function recordFailure(error: unknown): void {
  state.failures += 1;
  if (state.failures === BREAKER_THRESHOLD) {
    state.pausedUntil = Date.now() + BREAKER_PAUSE_MS;
    console.error("Cache unavailable, reading from the database for a while:", error);
  }
}

/** Runs a store command with a timeout. Returns undefined on failure or while the breaker is open. */
async function guarded<T>(run: (store: CacheAdapter) => Promise<T>): Promise<T | undefined> {
  if (Date.now() < state.pausedUntil) return undefined;
  try {
    const result = await Promise.race([
      run(adapter()),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Cache timeout")), COMMAND_TIMEOUT_MS)),
    ]);
    state.failures = 0;
    return result;
  } catch (error) {
    recordFailure(error);
    return undefined;
  }
}

function trusted(): boolean {
  return Date.now() >= state.untrustedUntil;
}

const versionKey = (userId: string) => `wh:${KEY_VERSION}:ver:${userId}`;

/** `id:version` for everyone in `userIds`, sorted, or null when versions cannot be read. */
async function versionsOf(userIds: string[]): Promise<string | null> {
  const ids = [...new Set(userIds)].sort();
  const values = await guarded((store) => store.mget(ids.map(versionKey)));
  if (!values) return null;
  return ids.map((id, index) => `${id}:${values[index] ?? "0"}`).join(",");
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex").slice(0, 16);
}

export type CacheOptions<T> = {
  /** Name of the cached function; part of the key. */
  name: string;
  /**
   * Everyone whose writes can change the result: the reader's whole household, even when the
   * query itself covers fewer people (a transfer from a member changes my balance).
   */
  memberIds: string[];
  /** Everything else the result depends on (filters, today, the people the query covers). */
  args?: unknown;
  ttlSeconds?: number;
  /** Turns the parsed JSON back into the real shape, for values that hold things JSON cannot (Date). */
  revive?: (json: unknown) => T;
};

/**
 * Returns the cached value for this function, people and arguments, or runs `load` and stores the
 * result. `load` must return JSON-safe data without translated text.
 */
export async function cached<T>(options: CacheOptions<T>, load: () => Promise<T>): Promise<T> {
  if (!trusted() || adapter() instanceof NoopAdapter) return load();
  const versions = await versionsOf(options.memberIds);
  if (versions === null) return load();

  const key = `wh:${KEY_VERSION}:d:${options.name}:${hashOf([versions, options.args ?? null])}`;
  const hit = await guarded((store) => store.get(key));
  if (typeof hit === "string") {
    try {
      const parsed: unknown = JSON.parse(hit);
      state.hits += 1;
      return options.revive ? options.revive(parsed) : (parsed as T);
    } catch {
      // A corrupt entry is treated as a miss and overwritten below.
    }
  }
  state.misses += 1;

  // One load per key at a time in this process, so a burst of identical misses runs it once.
  const running = state.inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = (async () => {
    const value = await load();
    const ttl = options.ttlSeconds ?? TTL.data;
    const json = JSON.stringify(value);
    if (json !== undefined) {
      await guarded((store) => store.set(key, json, Math.round(ttl * (1 + Math.random() * 0.1))));
    }
    return value;
  })();
  state.inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    state.inFlight.delete(key);
  }
}

/**
 * Call after anything that changes what these users (or their household) can see. A bump that
 * cannot be stored makes reads skip the cache for a minute, because a stale read could follow.
 */
export async function bumpUsers(userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const results = await Promise.all(ids.map((id) => guarded((store) => store.incr(versionKey(id)))));
  // The catch-up gate is cleared too: a rule changed by this write may be due today.
  await Promise.all(ids.map((id) => guarded((store) => store.del(gateKey(id)))));
  if (results.some((result) => result === undefined)) state.untrustedUntil = Date.now() + UNTRUSTED_MS;
}

// --- Global values (no user) ---

const globalKey = (name: string) => `wh:${KEY_VERSION}:g:${name}`;

/** A value shared by everyone, such as the announcement. */
export async function cachedGlobal<T>(name: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  if (!trusted() || adapter() instanceof NoopAdapter) return load();
  const key = globalKey(name);
  const hit = await guarded((store) => store.get(key));
  if (typeof hit === "string") {
    try {
      state.hits += 1;
      return JSON.parse(hit) as T;
    } catch {
      // Corrupt entry: reload.
    }
  }
  state.misses += 1;
  const value = await load();
  const json = JSON.stringify(value);
  if (json !== undefined) await guarded((store) => store.set(key, json, ttlSeconds));
  return value;
}

export async function invalidateGlobal(name: string): Promise<void> {
  const done = await guarded((store) => store.del(globalKey(name)));
  if (done === undefined) state.untrustedUntil = Date.now() + UNTRUSTED_MS;
}

// --- Rate limit counters ---

/**
 * Counts one hit in a fixed window and returns the count so far, or undefined when the cache is
 * off or unreachable (callers then let the request through: the limiter must never lock users out).
 */
export async function countHit(name: string, subject: string, windowSeconds: number): Promise<number | undefined> {
  if (adapter() instanceof NoopAdapter) return undefined;
  return guarded((store) => store.incrWithTtl(`wh:${KEY_VERSION}:rl:${name}:${subject}`, windowSeconds));
}

// --- Recurring catch-up gate ---

const gateKey = (userId: string) => `wh:${KEY_VERSION}:gate:materialize:${userId}`;

/**
 * True when the recurring catch-up should run for this user now: at most once per few minutes.
 * Without a working cache it is always true, which is the behaviour before caching existed.
 */
export async function shouldRunCatchUp(userId: string): Promise<boolean> {
  const created = await guarded((store) => store.setIfAbsent(gateKey(userId), "1", TTL.materializeGate));
  return created ?? true;
}
