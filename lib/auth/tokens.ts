import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { authTokens } from "@/db/schema";
import { RESET_TOKEN_TTL_SECONDS, VERIFICATION_TOKEN_TTL_SECONDS } from "./constants";

export type AuthTokenType = "email_verification" | "password_reset";

const TTL_SECONDS: Record<AuthTokenType, number> = {
  email_verification: VERIFICATION_TOKEN_TTL_SECONDS,
  password_reset: RESET_TOKEN_TTL_SECONDS,
};

/** 32 random bytes, base64url. Only its SHA-256 hash is ever stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a one-time token for the user and returns the raw value (to put in an email link).
 * Older unused tokens of the same type for that user are invalidated.
 */
export async function createAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const db = getDb();
  const token = generateToken();
  await db.transaction(async (tx) => {
    await tx
      .delete(authTokens)
      .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
    await tx.insert(authTokens).values({
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TTL_SECONDS[type] * 1000),
    });
  });
  return token;
}

/**
 * Atomically marks a valid token as used and returns its user id, or null when the token is
 * unknown, of another type, expired, or already used (single-use).
 */
export async function consumeAuthToken(token: string, type: AuthTokenType): Promise<string | null> {
  const [row] = await getDb()
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authTokens.userId });
  return row?.userId ?? null;
}
