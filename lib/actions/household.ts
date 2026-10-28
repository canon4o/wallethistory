"use server";

import { revalidatePath } from "@/lib/cache/revalidate";
import { and, count, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { goals, householdInvites, householdMembers, households } from "@/db/schema";
import { HOUSEHOLD_INVITE_TTL_SECONDS, MAX_PENDING_HOUSEHOLD_INVITES } from "@/lib/auth/constants";
import { requireUser } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/auth/users";
import { buildAppUrl } from "@/lib/email/links";
import { householdInviteEmail } from "@/lib/email/templates";
import { getT } from "@/lib/i18n/server";
import { sendEmail } from "@/lib/email/transport";
import { idSchema } from "@/lib/validation/common";
import { inviteSchema } from "@/lib/validation/household";
import {
  fieldFailure,
  guarded,
  notFoundFailure,
  validationFailure,
  type ActionResult,
} from "./result";
import { msg } from "@/lib/i18n/translate";

const INVITE_GONE = msg("This invitation is no longer valid.");
const ALREADY_IN_HOUSEHOLD = msg("You are already in a household. Leave it first to join another.");

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function revalidate() {
  // Household membership will also change what the dashboard, accounts and transactions show.
  await revalidatePath("/", "layout");
}

/**
 * Goals shared with a household stop being shared once their owner is no longer in it, so they do
 * not reappear if the owner joins another household later. Money already in them stays.
 */
async function unshareGoals(tx: Tx, userIds: string[]) {
  if (userIds.length > 0) await tx.update(goals).set({ shared: false }).where(inArray(goals.userId, userIds));
}

/** Deletes the household once fewer than two people are left in it. */
async function dissolveIfAlone(tx: Tx, householdId: string) {
  const remaining = await tx
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  if (remaining.length < 2) {
    await unshareGoals(tx, remaining.map((member) => member.userId));
    await tx.delete(households).where(eq(households.id, householdId));
  }
}

/**
 * Invites someone by email. The answer is the same whether or not the email belongs to an
 * account (no enumeration); only an existing account actually receives the invitation.
 */
export async function inviteToHousehold(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const email = parsed.data.email;
  if (email === user.email.toLowerCase()) return fieldFailure("email", msg("You can't invite yourself."));

  return guarded(async () => {
    const db = getDb();
    const now = new Date();
    const [{ pending }] = await db
      .select({ pending: count() })
      .from(householdInvites)
      .where(and(eq(householdInvites.inviterId, user.id), gt(householdInvites.expiresAt, now)));
    if (pending >= MAX_PENDING_HOUSEHOLD_INVITES) {
      return fieldFailure("email", msg("You have too many pending invitations. Cancel some first."));
    }

    const invitee = await findUserByEmail(email);
    const expiresAt = new Date(now.getTime() + HOUSEHOLD_INVITE_TTL_SECONDS * 1000);
    // Re-inviting the same email renews the invitation instead of failing.
    await db.transaction(async (tx) => {
      await tx
        .delete(householdInvites)
        .where(
          and(
            eq(householdInvites.inviterId, user.id),
            sql`lower(${householdInvites.inviteeEmail}) = ${email}`,
          ),
        );
      await tx
        .insert(householdInvites)
        .values({ inviterId: user.id, inviteeEmail: email, inviteeId: invitee?.id ?? null, expiresAt });
    });

    if (invitee) {
      await sendEmail({
        to: invitee.email,
        ...householdInviteEmail({
          t: await getT(),
          name: invitee.name,
          inviterName: user.name,
          url: buildAppUrl("/profile/household"),
        }),
      });
    }
    await revalidatePath("/profile/household");
    return { ok: true };
  });
}

/** The inviter withdraws an invitation they sent. */
export async function cancelHouseholdInvite(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure(INVITE_GONE);

  return guarded(async () => {
    const deleted = await getDb()
      .delete(householdInvites)
      .where(and(eq(householdInvites.id, parsedId.data), eq(householdInvites.inviterId, user.id)))
      .returning({ id: householdInvites.id });
    if (deleted.length === 0) return notFoundFailure(INVITE_GONE);
    await revalidatePath("/profile/household");
    return { ok: true };
  });
}

/** The invitee turns an invitation down. */
export async function declineHouseholdInvite(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure(INVITE_GONE);

  return guarded(async () => {
    const deleted = await getDb()
      .delete(householdInvites)
      .where(and(eq(householdInvites.id, parsedId.data), eq(householdInvites.inviteeId, user.id)))
      .returning({ id: householdInvites.id });
    if (deleted.length === 0) return notFoundFailure(INVITE_GONE);
    await revalidatePath("/profile/household");
    return { ok: true };
  });
}

/**
 * The invitee joins the inviter's household (created now if the inviter has none yet).
 * A user can be in only one household, so joining requires not being in one already.
 */
export async function acceptHouseholdInvite(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return notFoundFailure(INVITE_GONE);

  return guarded(async () => {
    try {
      const result = await getDb().transaction(async (tx): Promise<ActionResult> => {
        const [invite] = await tx
          .select({ inviterId: householdInvites.inviterId })
          .from(householdInvites)
          .where(
            and(
              eq(householdInvites.id, parsedId.data),
              eq(householdInvites.inviteeId, user.id),
              gt(householdInvites.expiresAt, new Date()),
            ),
          );
        if (!invite) return notFoundFailure(INVITE_GONE);

        const [mine] = await tx
          .select({ id: householdMembers.householdId })
          .from(householdMembers)
          .where(eq(householdMembers.userId, user.id));
        if (mine) return { ok: false, error: ALREADY_IN_HOUSEHOLD };

        const [theirs] = await tx
          .select({ id: householdMembers.householdId })
          .from(householdMembers)
          .where(eq(householdMembers.userId, invite.inviterId));
        let householdId = theirs?.id;
        if (!householdId) {
          const [created] = await tx.insert(households).values({}).returning({ id: households.id });
          householdId = created.id;
          await tx.insert(householdMembers).values({ householdId, userId: invite.inviterId });
        }
        await tx.insert(householdMembers).values({ householdId, userId: user.id });
        // Anything else addressed to me is moot once I am in a household.
        await tx.delete(householdInvites).where(eq(householdInvites.inviteeId, user.id));
        return { ok: true };
      });
      if (result.ok) await revalidate();
      return result;
    } catch (error) {
      // A concurrent accept put one of the two users in a household first.
      if (isUniqueViolation(error)) return { ok: false, error: ALREADY_IN_HOUSEHOLD };
      throw error;
    }
  });
}

/** Leaves my household. Nobody's data changes; the two sides just stop seeing each other's. */
export async function leaveHousehold(): Promise<ActionResult> {
  const user = await requireUser();
  return guarded(async () => {
    await getDb().transaction(async (tx) => {
      const left = await tx
        .delete(householdMembers)
        .where(eq(householdMembers.userId, user.id))
        .returning({ householdId: householdMembers.householdId });
      if (left[0]) {
        await unshareGoals(tx, [user.id]);
        await dissolveIfAlone(tx, left[0].householdId);
      }
    });
    await revalidate();
    return { ok: true };
  });
}

/** Any member can end the link with another member of their own household. */
export async function removeHouseholdMember(memberId: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(memberId);
  if (!parsedId.success) return notFoundFailure(msg("This member is no longer in your household."));

  return guarded(async () => {
    const gone = await notFoundFailure(msg("This member is no longer in your household."));
    const result = await getDb().transaction(async (tx): Promise<ActionResult> => {
      const [mine] = await tx
        .select({ id: householdMembers.householdId })
        .from(householdMembers)
        .where(eq(householdMembers.userId, user.id));
      if (!mine || parsedId.data === user.id) return gone;
      const removed = await tx
        .delete(householdMembers)
        .where(
          and(
            eq(householdMembers.userId, parsedId.data),
            eq(householdMembers.householdId, mine.id),
            ne(householdMembers.userId, user.id),
          ),
        )
        .returning({ id: householdMembers.userId });
      if (removed.length === 0) return gone;
      await unshareGoals(tx, [parsedId.data]);
      await dissolveIfAlone(tx, mine.id);
      return { ok: true };
    });
    if (result.ok) await revalidate();
    return result;
  });
}
