import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Disposable database for integration tests, or undefined (those tests are then skipped). */
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || undefined;

export function connectTestDb() {
  if (!TEST_DATABASE_URL) throw new Error("DATABASE_URL_TEST is not set");
  return postgres(TEST_DATABASE_URL, { prepare: false, onnotice: () => {} });
}

/** Applies every migration in db/migrations (a no-op once they are all applied). */
export async function migrateTestDb(sql: ReturnType<typeof connectTestDb>) {
  await migrate(drizzle(sql), {
    migrationsFolder: path.resolve(process.cwd(), "db/migrations"),
  });
}
