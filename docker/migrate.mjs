// Applies the SQL files in db/migrations to DATABASE_URL, then exits. Already applied migrations
// are skipped, so running it on every start is safe. Uses a plain connection (not a transaction
// pooler), like `npm run db:migrate`.
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: path.resolve(process.cwd(), "db/migrations") });
  console.log("Migrations are up to date.");
} catch (error) {
  // Drizzle wraps driver errors ("Failed query: ..."); the cause says what actually went wrong.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  console.error("Migration failed:", cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
  await sql.end();
}
