import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { sessions, users } from "@/db/schema";
import { DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currencies";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { hashPassword } from "./password";

// Unauthenticated user lookups and writes used by the login / register / reset flows.
// These cannot call requireUser() (there is no session yet); they are only reachable from
// lib/actions/auth.ts and always receive already-validated input.

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  blockedAt: Date | null;
};

const authUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  passwordHash: users.passwordHash,
  emailVerifiedAt: users.emailVerifiedAt,
  blockedAt: users.blockedAt,
};

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const [user] = await getDb()
    .select(authUserColumns)
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);
  return user ?? null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const [user] = await getDb().select(authUserColumns).from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export type CreateUserResult =
  | { ok: true; id: string }
  | { ok: false; reason: "email_taken" };

/** Creates the user (the database trigger adds the Cash account and default categories). */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  verified: boolean;
  currency?: CurrencyCode;
  timezone?: string;
}): Promise<CreateUserResult> {
  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await getDb()
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        emailVerifiedAt: input.verified ? new Date() : null,
        currency: input.currency ?? DEFAULT_CURRENCY,
        timezone: input.timezone ?? DEFAULT_TIMEZONE,
      })
      .returning({ id: users.id });
    return { ok: true, id: user.id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "email_taken" };
    throw error;
  }
}

export async function markEmailVerified(userId: string): Promise<void> {
  await getDb().update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}

/** Sets a new password. Callers decide which sessions to delete. */
export async function setUserPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await getDb().update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** Sets a new password and deletes every session of the user. */
export async function resetUserPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}
