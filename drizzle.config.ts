import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only reads the schema. `drizzle-kit migrate` needs DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
