import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

type Cache = { client?: ReturnType<typeof postgres>; db?: Database };

// Keep one client across hot reloads in dev (module state is reset on every reload).
const globalCache = globalThis as typeof globalThis & { __walletHistoryDb?: Cache };
const cache: Cache = (globalCache.__walletHistoryDb ??= {});

/**
 * Shared Drizzle instance. Created lazily so importing this module never needs env vars
 * (for example during `next build`). `prepare: false` because Supabase's pooler in
 * transaction mode does not support prepared statements.
 */
export function getDb(): Database {
  if (!cache.db) {
    cache.client = postgres(getEnv().DATABASE_URL, {
      prepare: false,
      max: getEnv().DATABASE_POOL_MAX,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    cache.db = drizzle(cache.client, { schema });
  }
  return cache.db;
}
