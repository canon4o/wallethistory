import { cache } from "react";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { householdInvites, householdMembers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

export type HouseholdMember = { id: string; name: string; isMe: boolean };
/** An invitation someone sent to me. */
export type IncomingInvite = { id: string; inviterName: string };
/** An invitation I sent. Shows the email I typed, never whether it belongs to an account. */
export type OutgoingInvite = { id: string; email: string };

export type HouseholdOverview = {
  /** Everyone in my household including me; empty when I am not in one. */
  members: HouseholdMember[];
  incoming: IncomingInvite[];
  outgoing: OutgoingInvite[];
};

/** Names only: other members' emails are never returned. */
export async function getHouseholdOverview(): Promise<HouseholdOverview> {
  const user = await requireUser();
  const db = getDb();
  const now = new Date();

  const [membership] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, user.id));

  const members = membership
    ? await db
        .select({ id: users.id, name: users.name })
        .from(householdMembers)
        .innerJoin(users, eq(users.id, householdMembers.userId))
        .where(eq(householdMembers.householdId, membership.householdId))
        .orderBy(asc(householdMembers.joinedAt), asc(users.name))
    : [];

  const incoming = await db
    .select({ id: householdInvites.id, inviterName: users.name })
    .from(householdInvites)
    .innerJoin(users, eq(users.id, householdInvites.inviterId))
    .where(and(eq(householdInvites.inviteeId, user.id), gt(householdInvites.expiresAt, now)))
    .orderBy(asc(householdInvites.createdAt));

  const outgoing = await db
    .select({ id: householdInvites.id, email: householdInvites.inviteeEmail })
    .from(householdInvites)
    .where(and(eq(householdInvites.inviterId, user.id), gt(householdInvites.expiresAt, now)))
    .orderBy(asc(householdInvites.createdAt));

  return { members: members.map((m) => ({ ...m, isMe: m.id === user.id })), incoming, outgoing };
}


export type HouseholdScope = {
  /** The current user's id. */
  userId: string;
  /** Everyone whose data the user may READ: themselves plus their household members. */
  memberIds: string[];
  /** Names of everyone in `memberIds`. */
  names: Map<string, string>;
};

/**
 * Whose data the current user may read. Writes never use this: they are always scoped to the
 * user's own id. Without a household it is just the user.
 */
export const getHouseholdScope = cache(async (userId: string, userName: string): Promise<HouseholdScope> => {
  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(
      inArray(
        householdMembers.householdId,
        getDb()
          .select({ id: householdMembers.householdId })
          .from(householdMembers)
          .where(eq(householdMembers.userId, userId)),
      ),
    );
  const names = new Map(rows.map((row) => [row.id, row.name]));
  names.set(userId, userName);
  return { userId, memberIds: [userId, ...rows.map((r) => r.id).filter((id) => id !== userId)], names };
});

/** Convenience for data functions: requires a signed-in user and returns their read scope. */
export async function requireHouseholdScope(): Promise<HouseholdScope> {
  const user = await requireUser();
  return getHouseholdScope(user.id, user.name);
}
