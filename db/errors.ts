// Postgres SQLSTATE codes the app reacts to.
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

/** postgres.js errors carry the SQLSTATE in `code`; Drizzle may wrap them in `cause`. */
export function postgresErrorCode(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  for (const candidate of candidates) {
    if (typeof candidate === "object" && candidate !== null) {
      const code = (candidate as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown) => postgresErrorCode(error) === UNIQUE_VIOLATION;

/** A row is still referenced (for example an account or category used by transactions). */
export const isForeignKeyViolation = (error: unknown) =>
  postgresErrorCode(error) === FOREIGN_KEY_VIOLATION;

/** A database rule rejected the row (check constraints and our integrity triggers). */
export const isCheckViolation = (error: unknown) => postgresErrorCode(error) === CHECK_VIOLATION;
