import IORedis from "ioredis";

/**
 * The small surface the app needs from a cache store. Values are strings (JSON is handled one
 * level up), so a different store can be swapped in by writing one more adapter.
 */
export interface CacheAdapter {
  get(key: string): Promise<string | null>;
  /** Values in the order of `keys`, null for a missing key. */
  mget(keys: string[]): Promise<Array<string | null>>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Sets only if the key does not exist; true when this call created it. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Atomic increment; a missing key starts at 0. */
  incr(key: string): Promise<number>;
  /** Atomic increment that starts a TTL when the key is created (a fixed window counter). */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  del(key: string): Promise<void>;
}

/** Cache disabled: every read misses and every write is dropped. */
export class NoopAdapter implements CacheAdapter {
  async get() {
    return null;
  }
  async mget(keys: string[]) {
    return keys.map(() => null);
  }
  async set() {}
  async setIfAbsent() {
    return true;
  }
  async incr() {
    return 0;
  }
  async incrWithTtl() {
    return 0;
  }
  async del() {}
}

/** In-process store, for tests. Not shared between server instances, so never used in production. */
export class MemoryAdapter implements CacheAdapter {
  private readonly entries = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly now: () => number = Date.now) {}

  private read(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async get(key: string) {
    return this.read(key);
  }
  async mget(keys: string[]) {
    return keys.map((key) => this.read(key));
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }
  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.read(key) !== null) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }
  async incr(key: string) {
    const next = Number(this.read(key) ?? 0) + 1;
    const existing = this.entries.get(key);
    this.entries.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? null });
    return next;
  }
  async incrWithTtl(key: string, ttlSeconds: number) {
    if (this.read(key) === null) this.entries.set(key, { value: "0", expiresAt: this.now() + ttlSeconds * 1000 });
    return this.incr(key);
  }
  async del(key: string) {
    this.entries.delete(key);
  }
  /** Test helper: number of live keys. */
  size() {
    return [...this.entries.keys()].filter((key) => this.read(key) !== null).length;
  }
}

type TcpClient = Pick<IORedis, "get" | "mget" | "set" | "incr" | "expire" | "del">;

function connect(url: string): IORedis {
  const redis = new IORedis(url, {
    // Commands wait for the connection (and fail after commandTimeout) instead of failing at once,
    // so the first request after a cold start still gets an answer. ioredis reconnects by itself.
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 250,
  });
  // Connection errors surface as failed commands, which the cache layer already handles.
  redis.on("error", () => {});
  return redis;
}

/** Any Redis server over TCP (`redis://` or `rediss://` URL) */
export class RedisAdapter implements CacheAdapter {
  private readonly redis: TcpClient;

  /** `client` is only for tests. */
  constructor(url: string, client?: TcpClient) {
    this.redis = client ?? connect(url);
  }

  get(key: string) {
    return this.redis.get(key);
  }
  async mget(keys: string[]) {
    return keys.length === 0 ? [] : this.redis.mget(...keys);
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }
  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return (await this.redis.set(key, value, "EX", ttlSeconds, "NX")) === "OK";
  }
  incr(key: string) {
    return this.redis.incr(key);
  }
  async incrWithTtl(key: string, ttlSeconds: number) {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, ttlSeconds);
    return count;
  }
  async del(key: string) {
    await this.redis.del(key);
  }
}
