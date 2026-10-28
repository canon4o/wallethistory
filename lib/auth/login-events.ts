import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { loginEvents, users } from "@/db/schema";
import { requestOrigin } from "./request-origin";

export const LOGIN_EVENT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type LoginFailureReason = "unknown_email" | "bad_password" | "blocked" | "unverified";

type LoginAttempt = { email: string; userId: string | null } & (
  | { success: true }
  | { success: false; reason: LoginFailureReason }
);

/**
 * Writes one login_events row (and last_login_at on success). It must never break login, so any
 * database error is logged and swallowed. No password or token is ever stored.
 */
export async function recordLoginAttempt(attempt: LoginAttempt): Promise<void> {
  try {
    const db = getDb();
    const { ip, userAgent } = await requestOrigin();
    await db.insert(loginEvents).values({
      userId: attempt.userId,
      emailAttempted: attempt.email.toLowerCase(),
      success: attempt.success,
      reason: attempt.success ? null : attempt.reason,
      ip,
      userAgent,
    });
    if (attempt.success && attempt.userId) {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, attempt.userId));
      await db
        .delete(loginEvents)
        .where(lt(loginEvents.createdAt, new Date(Date.now() - LOGIN_EVENT_RETENTION_DAYS * DAY_MS)));
    }
  } catch (error) {
    console.error("Could not record login attempt:", error);
  }
}
