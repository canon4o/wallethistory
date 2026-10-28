import { cachedGlobal, TTL } from "@/lib/cache";
import { and, count, desc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLog, loginEvents, sessions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import type { AdminLoginFilters, AdminUserFilters, OverviewRange } from "@/lib/validation/admin";

// The only data functions that look across users. Every one calls requireAdmin() and selects a
// fixed list of columns: no password hashes and no money tables beyond row COUNTS. Admins never
// see transactions, balances or names of accounts, categories, tags or budgets.

const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Page<T> = { items: T[]; total: number; page: number; pageCount: number };

function paginate<T>(items: T[], total: number, requestedPage: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { items, total, page: Math.min(requestedPage, pageCount), pageCount };
}

function pageCountOf(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

async function countWhere(where: SQL | undefined): Promise<number> {
  const [row] = await getDb().select({ value: count() }).from(users).where(where);
  return row.value;
}

// --- Overview ---

export type AdminOverview = {
  totalUsers: number;
  newLast7Days: number;
  newLast30Days: number;
  unverified: number;
  blocked: number;
  failedLogins24h: number;
  /** Mutually exclusive: blocked first, then not verified, the rest are active. */
  active: number;
  newPrevious7Days: number;
  failedLoginsPrevious24h: number;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdmin();
  // Counts over whole tables; a minute-old number is fine for an overview.
  return cachedGlobal("admin-overview", TTL.admin, loadAdminOverview);
}

async function loadAdminOverview(): Promise<AdminOverview> {
  const iso = (days: number) => sql`${daysAgo(days).toISOString()}::timestamptz`;
  // One round trip: the admin pages must not open many connections at once, because a
  // connection pooler with a small limit would make the extra queries wait in line.
  const [row] = await getDb()
    .select({
      totalUsers: count(),
      newLast7Days: sql<number>`count(*) filter (where ${users.createdAt} >= ${iso(7)})`.mapWith(Number),
      newLast30Days: sql<number>`count(*) filter (where ${users.createdAt} >= ${iso(30)})`.mapWith(Number),
      unverified: sql<number>`count(*) filter (where ${users.emailVerifiedAt} is null)`.mapWith(Number),
      blocked: sql<number>`count(*) filter (where ${users.blockedAt} is not null)`.mapWith(Number),
      failedLogins24h: sql<number>`(select count(*) from login_events where not success and created_at >= ${iso(1)})`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${users.blockedAt} is null and ${users.emailVerifiedAt} is not null)`.mapWith(Number),
      newPrevious7Days: sql<number>`count(*) filter (where ${users.createdAt} >= ${iso(14)} and ${users.createdAt} < ${iso(7)})`.mapWith(Number),
      failedLoginsPrevious24h: sql<number>`(select count(*) from login_events where not success and created_at >= ${iso(2)} and created_at < ${iso(1)})`.mapWith(Number),
    })
    .from(users);
  return row;
}

// --- Users ---

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  verified: boolean;
  blocked: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listAdminUsers(filters: AdminUserFilters): Promise<Page<AdminUserRow>> {
  await requireAdmin();
  const conditions: Array<SQL | undefined> = [];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern)));
  }
  if (filters.status === "admins") conditions.push(eq(users.role, "admin"));
  if (filters.status === "blocked") conditions.push(isNotNull(users.blockedAt));
  if (filters.status === "unverified") conditions.push(isNull(users.emailVerifiedAt));
  const where = and(...conditions);

  const total = await countWhere(where);
  const page = Math.min(filters.page, pageCountOf(total));
  const rows = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      blockedAt: users.blockedAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), users.id)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const items = rows.map(({ emailVerifiedAt, blockedAt, ...row }) => ({
    ...row,
    verified: emailVerifiedAt !== null,
    blocked: blockedAt !== null,
  }));
  return paginate(items, total, page);
}

export type AdminLoginRow = {
  id: string;
  createdAt: Date;
  userId: string | null;
  userName: string | null;
  email: string;
  success: boolean;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
};

export type AdminSessionRow = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
};

export type AdminUserDetail = AdminUserRow & {
  blockedAt: Date | null;
  currency: string;
  timezone: string;
  /** Signed-in devices. Never includes the session token. */
  sessions: AdminSessionRow[];
  inHousehold: boolean;
  /** Counts only. Names and amounts are never shown to admins. */
  accountCount: number;
  transactionCount: number;
  recentLogins: AdminLoginRow[];
};

const loginColumns = {
  id: loginEvents.id,
  createdAt: loginEvents.createdAt,
  userId: loginEvents.userId,
  userName: users.name,
  email: loginEvents.emailAttempted,
  success: loginEvents.success,
  reason: loginEvents.reason,
  ip: loginEvents.ip,
  userAgent: loginEvents.userAgent,
};

export async function getAdminUser(id: string): Promise<AdminUserDetail | null> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return null;
  const db = getDb();

  // The counts ride along in the user query; the queries then run one after another (see the
  // note in getAdminOverview about connection limits).
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      currency: users.currency,
      timezone: users.timezone,
      emailVerifiedAt: users.emailVerifiedAt,
      blockedAt: users.blockedAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      // "users"."id" is written out: Drizzle would print ${users.id} as a bare "id", which inside
      // these subqueries means the subquery's own table.
      accountCount: sql<number>`(select count(*) from accounts where user_id = "users"."id")`.mapWith(Number),
      transactionCount: sql<number>`(select count(*) from transactions where user_id = "users"."id")`.mapWith(Number),
      inHousehold: sql<boolean>`exists (select 1 from household_members where user_id = "users"."id")`,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!user) return null;

  const recentLogins = await db
    .select(loginColumns)
    .from(loginEvents)
    .leftJoin(users, eq(users.id, loginEvents.userId))
    .where(eq(loginEvents.userId, id))
    .orderBy(desc(loginEvents.createdAt))
    .limit(20);
  const activeSessions = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, id), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt));

  const { emailVerifiedAt, ...rest } = user;
  return {
    ...rest,
    verified: emailVerifiedAt !== null,
    blocked: user.blockedAt !== null,
    recentLogins,
    sessions: activeSessions,
  };
}

// --- Login activity ---

export async function listLoginEvents(filters: AdminLoginFilters): Promise<Page<AdminLoginRow>> {
  await requireAdmin();
  const conditions: Array<SQL | undefined> = [];
  if (filters.result === "success") conditions.push(eq(loginEvents.success, true));
  if (filters.result === "failed") conditions.push(eq(loginEvents.success, false));
  if (filters.userId) conditions.push(eq(loginEvents.userId, filters.userId));
  const where = and(...conditions);

  const [{ value: total }] = await getDb().select({ value: count() }).from(loginEvents).where(where);
  const page = Math.min(filters.page, pageCountOf(total));
  const items = await getDb()
    .select(loginColumns)
    .from(loginEvents)
    .leftJoin(users, eq(users.id, loginEvents.userId))
    .where(where)
    .orderBy(desc(loginEvents.createdAt), desc(loginEvents.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return paginate(items, total, page);
}

// --- Audit log ---

export type AdminAuditRow = {
  id: string;
  createdAt: Date;
  actorEmail: string;
  actorId: string | null;
  targetUserId: string | null;
  targetEmail: string | null;
  action: string;
  detail: Record<string, unknown> | null;
};

export async function listAuditLog(requestedPage: number): Promise<Page<AdminAuditRow>> {
  await requireAdmin();
  const [{ value: total }] = await getDb().select({ value: count() }).from(adminAuditLog);
  const page = Math.min(requestedPage, pageCountOf(total));
  const items = await getDb()
    .select({
      id: adminAuditLog.id,
      createdAt: adminAuditLog.createdAt,
      actorEmail: adminAuditLog.actorEmail,
      actorId: adminAuditLog.actorId,
      targetUserId: adminAuditLog.targetUserId,
      targetEmail: adminAuditLog.targetEmail,
      action: adminAuditLog.action,
      detail: adminAuditLog.detail,
    })
    .from(adminAuditLog)
    .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return paginate(items, total, page);
}

// --- Overview charts ---

export type DailyCount = { day: string; value: number };

export type AdminOverviewCharts = {
  days: OverviewRange;
  signups: DailyCount[];
  logins: DailyCount[];
  failedLogins: DailyCount[];
};

/** One value per day for the last `days` days (oldest first), zeros for quiet days. */
function fillDays(days: number, rows: Record<string, unknown>[]): DailyCount[] {
  const byDay = new Map(rows.map((row) => [String(row.day), Number(row.value)]));
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - index)))
      .toISOString()
      .slice(0, 10);
    return { day, value: byDay.get(day) ?? 0 };
  });
}

/** Daily counts for the overview chart: a single query, days bucketed in UTC. Counts only. */
export async function getAdminOverviewCharts(days: OverviewRange): Promise<AdminOverviewCharts> {
  await requireAdmin();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const at = sql`${start.toISOString()}::timestamptz`;
  const bucket = sql`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = (await getDb().execute(sql`
    select 'signups' as series, ${bucket} as day, count(*)::int as value
      from users where created_at >= ${at} group by 2
    union all
    select 'logins', ${bucket}, count(*)::int
      from login_events where success and created_at >= ${at} group by 2
    union all
    select 'failed', ${bucket}, count(*)::int
      from login_events where not success and created_at >= ${at} group by 2`)) as unknown as Record<string, unknown>[];
  const seriesOf = (name: string) => fillDays(days, rows.filter((row) => row.series === name));
  return { days, signups: seriesOf("signups"), logins: seriesOf("logins"), failedLogins: seriesOf("failed") };
}
