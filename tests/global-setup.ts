import { connectTestDb, migrateTestDb, TEST_DATABASE_URL } from "./helpers/test-db";

// Brings the disposable test database up to date once before any test file runs.
export default async function setup() {
  if (!TEST_DATABASE_URL) return;
  const sql = connectTestDb();
  try {
    await migrateTestDb(sql);
  } finally {
    await sql.end();
  }
}
