import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, goalContributions, goals, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { buildSavedSeries } from "@/lib/goals/progress";
import { toCents } from "@/lib/reports/money";
import { cached } from "@/lib/cache";
import { requireHouseholdScope, type HouseholdScope } from "./household";

export const GOAL_HISTORY_LIMIT = 200;

export type GoalOwner = { id: string; name: string; isMine: boolean };

export type GoalItem = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** numeric(14,2) as text. */
  targetAmount: string;
  /** `YYYY-MM-DD`, or null without a deadline. */
  deadline: string | null;
  shared: boolean;
  note: string | null;
  archived: boolean;
  /** Deposits minus withdrawals of everyone, as text ("0.00" when none). */
  saved: string;
  /** What the current user put in and has not taken out yet. */
  mySaved: string;
  /** Any contribution was ever made, including ones that were withdrawn again. */
  used: boolean;
  owner: GoalOwner;
  createdAt: Date;
};

const saved = sql<string>`coalesce((
  select sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end)
  from ${goalContributions} where ${goalContributions.goalId} = ${goals.id}
), 0)::numeric(14,2)::text`;

function mySaved(userId: string) {
  return sql<string>`coalesce((
    select sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end)
    from ${goalContributions} where ${goalContributions.goalId} = ${goals.id} and ${goalContributions.userId} = ${userId}
  ), 0)::numeric(14,2)::text`;
}

const used = sql<boolean>`exists (select 1 from ${goalContributions} where ${goalContributions.goalId} = ${goals.id})`;

/**
 * Goals the user may see: their own, shared goals of their household, and goals they put money
 * into (so they can still take it out after the goal stopped being shared). Deleted goals never.
 */
function visibleTo(scope: HouseholdScope): SQL {
  return and(
    isNull(goals.deletedAt),
    or(
      eq(goals.userId, scope.userId),
      and(eq(goals.shared, true), inArray(goals.userId, scope.memberIds)),
      sql`exists (select 1 from ${goalContributions} where ${goalContributions.goalId} = ${goals.id} and ${goalContributions.userId} = ${scope.userId})`,
    ),
  ) as SQL;
}

function selectGoals(scope: HouseholdScope) {
  return getDb()
    .select({
      id: goals.id,
      ownerId: goals.userId,
      ownerName: users.name,
      name: goals.name,
      icon: goals.icon,
      color: goals.color,
      targetAmount: goals.targetAmount,
      deadline: goals.deadline,
      shared: goals.shared,
      note: goals.note,
      archivedAt: goals.archivedAt,
      createdAt: goals.createdAt,
      saved,
      mySaved: mySaved(scope.userId),
      used,
    })
    .from(goals)
    .innerJoin(users, eq(users.id, goals.userId));
}

type GoalRow = Awaited<ReturnType<typeof selectGoals>>[number];

function toItem(row: GoalRow, scope: HouseholdScope): GoalItem {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    targetAmount: row.targetAmount,
    deadline: row.deadline,
    shared: row.shared,
    note: row.note,
    archived: row.archivedAt !== null,
    saved: row.saved,
    mySaved: row.mySaved,
    used: row.used,
    owner: {
      id: row.ownerId,
      name: scope.names.get(row.ownerId) ?? row.ownerName,
      isMine: row.ownerId === scope.userId,
    },
    createdAt: row.createdAt,
  };
}

/** Everything the user can see, newest first. Archived goals are included (the page filters them). */
export async function listGoals(): Promise<GoalItem[]> {
  const scope = await requireHouseholdScope();
  const rows = await selectGoals(scope).where(visibleTo(scope)).orderBy(desc(goals.createdAt), asc(goals.name));
  return rows.map((row) => toItem(row, scope));
}

export type DeletedGoalItem = {
  id: string;
  name: string;
  icon: string;
  color: string;
  deletedAt: Date;
  /** True when none of its movements still points at an existing account, so removing it changes no balance. */
  canDeletePermanently: boolean;
};

/** The user's own soft-deleted goals, most recently deleted first. They can only be restored or removed permanently. */
export async function listDeletedGoals(): Promise<DeletedGoalItem[]> {
  const user = await requireUser();
  const rows = await getDb()
    .select({
      id: goals.id,
      name: goals.name,
      icon: goals.icon,
      color: goals.color,
      deletedAt: goals.deletedAt,
      linked: sql<boolean>`exists (select 1 from ${goalContributions} where ${goalContributions.goalId} = "goals"."id" and ${goalContributions.accountId} is not null)`,
    })
    .from(goals)
    .where(and(eq(goals.userId, user.id), isNotNull(goals.deletedAt)))
    .orderBy(desc(goals.deletedAt), asc(goals.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    deletedAt: row.deletedAt as Date,
    canDeletePermanently: !row.linked,
  }));
}

/** One goal if the user may see it, otherwise null (the page then answers 404). */
export async function getGoal(id: string): Promise<GoalItem | null> {
  const scope = await requireHouseholdScope();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await selectGoals(scope).where(and(eq(goals.id, id), visibleTo(scope)));
  return row ? toItem(row, scope) : null;
}

export type GoalContributor = { userId: string; name: string; isMe: boolean; saved: string };

/** Who put how much into a goal (only people with money still in it), biggest first. */
export async function listGoalContributors(goalId: string): Promise<GoalContributor[]> {
  const scope = await requireHouseholdScope();
  const goal = await getGoal(goalId);
  if (!goal) return [];
  const net = sql<string>`sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end)::numeric(14,2)::text`;
  const rows = await getDb()
    .select({ userId: goalContributions.userId, saved: net })
    .from(goalContributions)
    .where(eq(goalContributions.goalId, goal.id))
    .groupBy(goalContributions.userId);
  return rows
    .filter((row) => toCents(row.saved) > 0)
    .map((row) => ({
      userId: row.userId,
      name: scope.names.get(row.userId) ?? "Former member",
      isMe: row.userId === scope.userId,
      saved: row.saved,
    }))
    .sort((a, b) => toCents(b.saved) - toCents(a.saved) || a.name.localeCompare(b.name));
}

export type GoalContributionItem = {
  id: string;
  type: "deposit" | "withdrawal";
  amount: string;
  date: string;
  note: string | null;
  /** The account the money came from or went to; only shown for my own rows. `id` is null once the account was deleted. */
  account: { id: string | null; name: string } | null;
  recurring: boolean;
  by: { id: string; name: string; isMine: boolean };
};

/** The newest contributions of a goal the user may see. Only the contributor can edit their own. */
export async function listGoalContributions(goalId: string): Promise<GoalContributionItem[]> {
  const scope = await requireHouseholdScope();
  const goal = await getGoal(goalId);
  if (!goal) return [];
  const rows = await getDb()
    .select({
      id: goalContributions.id,
      userId: goalContributions.userId,
      type: goalContributions.type,
      amount: goalContributions.amount,
      date: goalContributions.date,
      note: goalContributions.note,
      accountId: goalContributions.accountId,
      accountName: sql<string>`coalesce(${accounts.name}, ${goalContributions.accountName})`,
      recurring: isNotNull(goalContributions.recurringRuleId),
      recurringDate: goalContributions.recurringDate,
    })
    .from(goalContributions)
    .leftJoin(accounts, eq(accounts.id, goalContributions.accountId))
    .where(eq(goalContributions.goalId, goal.id))
    .orderBy(desc(goalContributions.date), desc(goalContributions.createdAt), desc(goalContributions.id))
    .limit(GOAL_HISTORY_LIMIT);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    date: row.date,
    note: row.note,
    account: row.userId === scope.userId ? { id: row.accountId, name: row.accountName } : null,
    recurring: row.recurringDate !== null,
    by: {
      id: row.userId,
      name: scope.names.get(row.userId) ?? "Former member",
      isMine: row.userId === scope.userId,
    },
  }));
}

/** The saved amount after each day with a movement, oldest first, for the history chart. */
export async function getGoalHistory(goalId: string): Promise<Array<{ date: string; saved: string }>> {
  const goal = await getGoal(goalId);
  if (!goal) return [];
  const rows = await getDb()
    .select({
      date: goalContributions.date,
      delta: sql<string>`sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end)::numeric(14,2)::text`,
    })
    .from(goalContributions)
    .where(eq(goalContributions.goalId, goal.id))
    .groupBy(goalContributions.date);
  return buildSavedSeries(rows.map((row) => ({ date: row.date, deltaCents: toCents(row.delta) }))).map((point) => ({
    date: point.date,
    saved: (point.savedCents / 100).toFixed(2),
  }));
}

export type GoalsOverview = {
  /** Net money the given people have put into goals (what their accounts "lost" to goals), as text. */
  inGoals: string;
  /** Visible goals that are not archived, soonest deadline first (no deadline last). */
  active: GoalItem[];
};

/** The dashboard panel: money set aside by `userIds` and the goals to show. */
export async function getGoalsOverview(userIds: string[], limit: number): Promise<GoalsOverview> {
  const user = await requireUser();
  const scope = await requireHouseholdScope();
  const { inGoals, rows } = await cached(
    {
      name: "goalsOverview",
      memberIds: scope.memberIds,
      args: { userIds, limit, me: scope.userId },
      // JSON turns dates into text; put them back.
      revive: (json) => {
        const value = json as { inGoals: string; rows: GoalRow[] };
        return {
          inGoals: value.inGoals,
          rows: value.rows.map((row) => ({
            ...row,
            createdAt: new Date(row.createdAt),
            archivedAt: row.archivedAt ? new Date(row.archivedAt) : null,
          })),
        };
      },
    },
    async () => {
      const [row] = await getDb()
        .select({
          inGoals: sql<string>`coalesce(sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amount} else -${goalContributions.amount} end), 0)::numeric(14,2)::text`,
        })
        .from(goalContributions)
        .where(inArray(goalContributions.userId, userIds.length ? userIds : [user.id]));
      const rows = await selectGoals(scope)
        .where(and(visibleTo(scope), isNull(goals.archivedAt)))
        .orderBy(sql`${goals.deadline} asc nulls last`, desc(goals.createdAt))
        .limit(limit);
      return { inGoals: row.inGoals, rows };
    },
  );
  return { inGoals, active: rows.map((r) => toItem(r, scope)) };
}
