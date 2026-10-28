import { sql } from "drizzle-orm";
import { getDb } from "@/db";

const TIMEOUT_MS = 3000;

/**
 * Public liveness check for the health endpoint (no user, no user data): true when the database
 * answers a trivial query in time. Redis is not checked, the app works without its cache.
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    });
    await Promise.race([getDb().execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
