"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, announcements, appSettings, authTokens, householdMembers, households, sessions, transfers, users } from "@/db/schema";
import type { CurrencyCode } from "@/lib/currencies";
import { writeAuditLog, type DbOrTx } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { SIGNUP_ENABLED_KEY } from "@/lib/auth/settings";
import {
  announcementSchema,
  changeRoleSchema,
  deleteUserSchema,
  revokeSessionSchema,
  signupSettingSchema,
  userIdSchema,
} from "@/lib/validation/admin";
import { adminRegionalSettingsSchema } from "@/lib/validation/regional";
import { failure, fieldFailure, guarded, notFoundFailure, validationFailure, type ActionFailure, type ActionResult } from "./result";
import { msg } from "@/lib/i18n/translate";
import { bumpUsers, invalidateGlobal } from "@/lib/cache";

// Every action: requireAdmin(), zod, one transaction that also writes the audit row, revalidate.
// Admins can never do these things to their own account, and role/block/delete changes are
// serialized by an advisory lock, so two admins can't lock each other out at the same time and
// there is always at least one active admin (the one performing the action).

const ADMIN_LOCK_KEY = 726_001;
const SELF = msg("You can't do this to your own account.");
const NO_LONGER_ADMIN = msg("You no longer have admin access.");

type Tx = Extract<DbOrTx, { rollback: () => never }>;
type Admin = { id: string; email: string };
type Target = { id: string; email: string; name: string; role: "user" | "admin"; blockedAt: Date | null };

async function revalidate() {
  await revalidatePath("/admin", "layout");
}

/**
 * Runs `change` for one target user inside a transaction holding the admin lock. The actor is
 * re-checked inside the lock, because another admin may have changed their access meanwhile.
 */
async function asAdminOn(
  rawInput: unknown,
  parse: (input: unknown) => { success: true; data: { userId: string } } | { success: false; failure: Promise<ActionFailure> },
  change: (tx: Tx, admin: Admin, target: Target, input: never) => Promise<ActionResult>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = parse(rawInput);
  if (!parsed.success) return parsed.failure;
  const { userId } = parsed.data;
  if (userId === admin.id) return failure(SELF);

  const result = await guarded(() =>
    getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_LOCK_KEY})`);
      const [actor] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, admin.id), eq(users.role, "admin"), isNull(users.blockedAt)));
      if (!actor) return { ok: false, error: NO_LONGER_ADMIN } as ActionFailure;

      const [target] = await tx
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, blockedAt: users.blockedAt })
        .from(users)
        .where(eq(users.id, userId));
      if (!target) return notFoundFailure(msg("This user no longer exists."));
      return change(tx, admin, target, parsed.data as never);
    }),
  );
  if (result.ok) {
    // The target's data and name appear in their household's cached views.
    await bumpUsers([userId]);
    await revalidate();
  }
  return result;
}

function parseWith<T extends { userId: string }>(schema: {
  safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: Parameters<typeof validationFailure>[0] };
}) {
  return (input: unknown) => {
    const parsed = schema.safeParse(input);
    return parsed.success
      ? ({ success: true, data: parsed.data } as const)
      : ({ success: false, failure: validationFailure(parsed.error) } as const);
  };
}

export async function changeUserRole(input: unknown): Promise<ActionResult> {
  return asAdminOn(input, parseWith(changeRoleSchema), async (tx, admin, target, { role }: { role: "user" | "admin" }) => {
    if (target.role === role) return { ok: true };
    await tx.update(users).set({ role }).where(eq(users.id, target.id));
    // A demoted admin must not keep a session that was opened with admin access in mind.
    if (role === "user") await tx.delete(sessions).where(eq(sessions.userId, target.id));
    await writeAuditLog(tx, { actor: admin, action: "role_changed", target, detail: { from: target.role, to: role } });
    return { ok: true };
  });
}

/** An admin can set a user's display currency and timezone (no financial data is involved). */
export async function updateUserRegionalSettings(input: unknown): Promise<ActionResult> {
  return asAdminOn(
    input,
    parseWith(adminRegionalSettingsSchema),
    async (tx, admin, target, { currency, timezone }: { currency: CurrencyCode; timezone: string }) => {
      const [current] = await tx
        .select({ currency: users.currency, timezone: users.timezone })
        .from(users)
        .where(eq(users.id, target.id));
      if (current.currency === currency && current.timezone === timezone) return { ok: true };
      await tx.update(users).set({ currency, timezone }).where(eq(users.id, target.id));
      await writeAuditLog(tx, {
        actor: admin,
        action: "regional_settings_changed",
        target,
        detail: {
          currency: { from: current.currency, to: currency },
          timezone: { from: current.timezone, to: timezone },
        },
      });
      return { ok: true };
    },
  );
}

export async function blockUser(input: unknown): Promise<ActionResult> {
  return asAdminOn(input, parseWith(userIdSchema), async (tx, admin, target) => {
    if (target.blockedAt) return { ok: true };
    await tx.update(users).set({ blockedAt: new Date() }).where(eq(users.id, target.id));
    await tx.delete(sessions).where(eq(sessions.userId, target.id));
    await writeAuditLog(tx, { actor: admin, action: "blocked", target });
    return { ok: true };
  });
}

export async function unblockUser(input: unknown): Promise<ActionResult> {
  return asAdminOn(input, parseWith(userIdSchema), async (tx, admin, target) => {
    if (!target.blockedAt) return { ok: true };
    await tx.update(users).set({ blockedAt: null }).where(eq(users.id, target.id));
    await writeAuditLog(tx, { actor: admin, action: "unblocked", target });
    return { ok: true };
  });
}

/** Marks the email as verified for someone who has not confirmed it (e.g. a mail that never arrived). */
export async function verifyUserEmail(input: unknown): Promise<ActionResult> {
  return asAdminOn(input, parseWith(userIdSchema), async (tx, admin, target) => {
    // The `is null` condition makes this a no-op (and no audit row) for an already verified email.
    const updated = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(users.id, target.id), isNull(users.emailVerifiedAt)))
      .returning({ id: users.id });
    if (updated.length === 0) return { ok: true };
    // Any pending verification link is now useless.
    await tx.delete(authTokens).where(and(eq(authTokens.userId, target.id), eq(authTokens.type, "email_verification")));
    await writeAuditLog(tx, { actor: admin, action: "email_verified", target });
    return { ok: true };
  });
}

export async function revokeUserSessions(input: unknown): Promise<ActionResult> {
  return asAdminOn(input, parseWith(userIdSchema), async (tx, admin, target) => {
    const removed = await tx.delete(sessions).where(eq(sessions.userId, target.id)).returning({ id: sessions.id });
    await writeAuditLog(tx, { actor: admin, action: "sessions_revoked", target, detail: { count: removed.length } });
    return { ok: true };
  });
}

export async function revokeUserSession(input: unknown): Promise<ActionResult> {
  return asAdminOn(input, parseWith(revokeSessionSchema), async (tx, admin, target, { sessionId }: { sessionId: string }) => {
    const removed = await tx
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, target.id)))
      .returning({ id: sessions.id });
    if (removed.length === 0) return notFoundFailure(msg("This session no longer exists."));
    await writeAuditLog(tx, { actor: admin, action: "session_revoked", target });
    return { ok: true };
  });
}

/**
 * Hard delete: the user row goes and the foreign keys wipe everything they own. Needs the user's
 * email typed as confirmation. Two things the foreign keys do not do on their own:
 * - transfers other people sent INTO this user's accounts are removed (an account with transfers
 *   cannot be deleted), which changes the sender's history;
 * - a household left with a single member is dissolved.
 */
export async function deleteUser(input: unknown): Promise<ActionResult> {
  return asAdminOn(input, parseWith(deleteUserSchema), async (tx, admin, target, { confirmEmail }: { confirmEmail: string }) => {
    if (confirmEmail.toLowerCase() !== target.email.toLowerCase()) {
      return fieldFailure("confirmEmail", msg("That email does not match this user."));
    }

    const [membership] = await tx
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, target.id));

    const ownAccounts = tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, target.id));
    const removedTransfers = await tx
      .delete(transfers)
      .where(inArray(transfers.toAccountId, ownAccounts))
      .returning({ id: transfers.id });

    await writeAuditLog(tx, {
      actor: admin,
      action: "deleted",
      target,
      detail: { name: target.name, role: target.role, transfersRemoved: removedTransfers.length },
    });
    await tx.delete(users).where(eq(users.id, target.id));

    if (membership) {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(householdMembers)
        .where(eq(householdMembers.householdId, membership.householdId));
      if (total < 2) await tx.delete(households).where(eq(households.id, membership.householdId));
    }
    return { ok: true };
  });
}

// --- Settings that are not about one user ---

/** Turns new signups on or off. The register action checks this on the server. */
export async function setSignupEnabled(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = signupSettingSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { enabled } = parsed.data;

  const result = await guarded(() =>
    getDb().transaction(async (tx) => {
      await tx
        .insert(appSettings)
        .values({ key: SIGNUP_ENABLED_KEY, value: enabled, updatedBy: admin.id })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: enabled, updatedBy: admin.id, updatedAt: new Date() },
        });
      await writeAuditLog(tx, { actor: admin, action: enabled ? "signup_enabled" : "signup_disabled" });
      return { ok: true } as ActionResult;
    }),
  );
  if (result.ok) {
    await revalidate();
    await revalidatePath("/login");
    await revalidatePath("/register");
  }
  return result;
}

/** Replaces the banner shown to every user. Plain text only; there is at most one at a time. */
export async function publishAnnouncement(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { message, level } = parsed.data;

  const result = await guarded(() =>
    getDb().transaction(async (tx) => {
      await tx.update(announcements).set({ active: false }).where(eq(announcements.active, true));
      await tx.insert(announcements).values({ message, level, active: true, createdBy: admin.id });
      await writeAuditLog(tx, { actor: admin, action: "announcement_published", detail: { message, level } });
      return { ok: true } as ActionResult;
    }),
  );
  if (result.ok) {
    await invalidateGlobal("announcement");
    await revalidatePath("/", "layout");
  }
  return result;
}

export async function clearAnnouncement(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await guarded(() =>
    getDb().transaction(async (tx) => {
      const cleared = await tx
        .update(announcements)
        .set({ active: false })
        .where(eq(announcements.active, true))
        .returning({ id: announcements.id });
      if (cleared.length > 0) await writeAuditLog(tx, { actor: admin, action: "announcement_cleared" });
      return { ok: true } as ActionResult;
    }),
  );
  if (result.ok) {
    await invalidateGlobal("announcement");
    await revalidatePath("/", "layout");
  }
  return result;
}
