import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { toCurrencyCode, type CurrencyCode } from "@/lib/currencies";
import { toTimezone } from "@/lib/timezones";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./constants";
import { secureCookies } from "./secure-cookie";
import { requestOrigin } from "./request-origin";
import { generateToken, hashToken } from "./tokens";

export type UserRole = "user" | "admin";
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Display currency and IANA timezone (see lib/currencies.ts, lib/timezones.ts). */
  currency: CurrencyCode;
  timezone: string;
  /** In-app budget alerts: on or off, and the percent of a budget that triggers a warning. */
  budgetAlertsEnabled: boolean;
  budgetAlertThreshold: number;
};

const SESSION_LIFETIME_MS = SESSION_MAX_AGE_SECONDS * 1000;

async function writeSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Creates a database session and sends its raw token in the httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const { ip, userAgent } = await requestOrigin();
  await getDb()
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
      ip,
      userAgent,
      lastSeenAt: new Date(),
    });
  await writeSessionCookie(token);
}

/**
 * The real session check (proxy.ts only looks at cookie presence).
 * Cookies can only be changed in Server Actions and Route Handlers, so when this runs while
 * rendering, cookie writes are skipped; /session/expired clears a dead cookie instead.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      currency: users.currency,
      timezone: users.timezone,
      budgetAlertsEnabled: users.budgetAlertsEnabled,
      budgetAlertThreshold: users.budgetAlertThreshold,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // A blocked user's sessions are deleted when they are blocked; this also stops any that remain.
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date()),
        isNull(users.blockedAt),
      ),
    )
    .limit(1);

  if (!row) {
    try {
      cookieStore.delete(SESSION_COOKIE);
    } catch {
      // Not in a Server Action / Route Handler: the cookie is cleared via /session/expired.
    }
    return null;
  }

  // Sliding expiry: renew once less than half of the lifetime is left.
  if (row.expiresAt.getTime() - Date.now() < SESSION_LIFETIME_MS / 2) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS), lastSeenAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
    try {
      await writeSessionCookie(token);
    } catch {
      // Cookie refresh is only possible in Server Actions / Route Handlers.
    }
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    currency: toCurrencyCode(row.currency),
    timezone: toTimezone(row.timezone),
    budgetAlertsEnabled: row.budgetAlertsEnabled,
    budgetAlertThreshold: row.budgetAlertThreshold,
  };
});

/** Returns the signed-in user or redirects to /login. Call it in every data function and action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;
  // A cookie that no longer maps to a session must be cleared, otherwise proxy.ts would
  // bounce /login back to /dashboard forever.
  const hasStaleCookie = (await cookies()).has(SESSION_COOKIE);
  redirect(hasStaleCookie ? "/session/expired" : "/login");
}

/**
 * For admin pages and actions: like requireUser(), but anyone who is not an admin gets a 404 so
 * /admin does not reveal itself. The role comes from the database on every call, never the cookie.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}

/** Logout: removes the session row and the cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Deletes every session of the user except the one making this request. */
export async function deleteOtherSessions(userId: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await getDb()
    .delete(sessions)
    .where(
      token
        ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(token)))
        : eq(sessions.userId, userId),
    );
}
