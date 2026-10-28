import { connectTestDb, migrateTestDb } from "../tests/helpers/test-db";

// Brings the disposable test database up to date (includes the seeded admin user).
export default async function globalSetup() {
  const sql = connectTestDb();
  try {
    await migrateTestDb(sql);
  } finally {
    await sql.end();
  }
}
