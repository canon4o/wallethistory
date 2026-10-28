import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
// Relative import: drizzle-kit loads this file without the "@/" alias.
import { ACCOUNT_TYPES } from "../lib/account-types";

// Source of truth for types. SQL lives in db/migrations (generated + hand-written);
// RLS, triggers and the seed are in the custom migrations because Drizzle can't express them.

export const accountType = pgEnum("account_type", ACCOUNT_TYPES);
export const transactionType = pgEnum("transaction_type", ["income", "expense"]);
export const recurringKind = pgEnum("recurring_kind", ["income", "expense", "transfer", "goal"]);
export const recurringFrequency = pgEnum("recurring_frequency", ["daily", "weekly", "monthly", "yearly"]);
export const recurringStatus = pgEnum("recurring_status", ["active", "paused", "ended"]);
// Why a rule is paused: by the user, stale for more than 2 years, its household link was lost, or
// the goal it pays into was archived.
export const recurringPausedReason = pgEnum("recurring_paused_reason", [
  "manual",
  "stale",
  "household_link",
  "goal_closed",
]);
// Money goes into a goal (deposit) or comes back out to an account (withdrawal). Never income.
export const goalContributionType = pgEnum("goal_contribution_type", ["deposit", "withdrawal"]);
export const budgetPeriod = pgEnum("budget_period", ["weekly", "monthly"]);
export const budgetAlertLevel = pgEnum("budget_alert_level", ["warning", "exceeded"]);
export const loginFailureReason = pgEnum("login_failure_reason", [
  "unknown_email",
  "bad_password",
  "blocked",
  "unverified",
]);
export const adminAction = pgEnum("admin_action", [
  "role_changed",
  "blocked",
  "unblocked",
  "deleted",
  "sessions_revoked",
  "session_revoked",
  "signup_enabled",
  "signup_disabled",
  "announcement_published",
  "announcement_cleared",
  "data_exported",
  "regional_settings_changed",
  "email_verified",
]);
export const announcementLevel = pgEnum("announcement_level", ["info", "warning"]);
export const userRole = pgEnum("user_role", ["user", "admin"]);
export const tokenType = pgEnum("token_type", ["email_verification", "password_reset"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    role: userRole("role").notNull().default("user"),
    // Set by an admin: a blocked user keeps all data but cannot log in or use a session.
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // Display only: ISO 4217 code (the app limits the choices) and IANA timezone name.
    currency: text("currency").notNull().default("USD"),
    timezone: text("timezone").notNull().default("UTC"),
    // In-app budget alerts: on or off, and the share of a budget (50..99) that triggers a warning.
    budgetAlertsEnabled: boolean("budget_alerts_enabled").notNull().default(true),
    budgetAlertThreshold: smallint("budget_alert_threshold").notNull().default(80),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    check("users_name_length", sql`char_length(${t.name}) between 1 and 100`),
    check("users_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("users_timezone_length", sql`char_length(${t.timezone}) between 1 and 64`),
    check("users_budget_alert_threshold_range", sql`${t.budgetAlertThreshold} between 50 and 99`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Shown to admins so a device can be recognized and revoked. Never the token itself.
    ip: text("ip"),
    userAgent: text("user_agent"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// One row per login attempt, for admins. user_id is null when the email matched no account.
// Rows are pruned after LOGIN_EVENT_RETENTION_DAYS (lib/auth/login-events.ts).
export const loginEvents = pgTable(
  "login_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    emailAttempted: text("email_attempted").notNull(),
    success: boolean("success").notNull(),
    reason: loginFailureReason("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("login_events_created_at_idx").on(t.createdAt.desc()),
    index("login_events_user_id_created_at_idx").on(t.userId, t.createdAt.desc()),
  ],
);

// What admins did to whom. target_user_id has no foreign key and target_email is a snapshot, so
// a row stays readable after the user is deleted.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    targetUserId: uuid("target_user_id"),
    targetEmail: text("target_email"),
    action: adminAction("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("admin_audit_log_created_at_idx").on(t.createdAt.desc())],
);

// Small key/value settings an admin can change. A missing row means the default.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// One banner shown to every signed-in user; at most one row is active (partial unique index).
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message: text("message").notNull(),
    level: announcementLevel("level").notNull().default("info"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("announcements_message_length", sql`char_length(${t.message}) between 1 and 280`),
    uniqueIndex("announcements_one_active_idx").on(t.active).where(sql`${t.active}`),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    type: tokenType("type").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    color: text("color").notNull(),
    // Key from lib/account-icons.ts (validated in the app, not in the database).
    icon: text("icon").notNull(),
    initialBalance: money("initial_balance").notNull().default("0"),
    // The account preselected on new transactions; at most one per user (partial unique index).
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_user_default_idx").on(t.userId).where(sql`${t.isDefault}`),
    check("accounts_color_hex", sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    type: transactionType("type").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    // Key from lib/category-icons.ts (validated in the app, not in the database).
    icon: text("icon").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("categories_user_type_name_idx").on(t.userId, t.type, sql`lower(${t.name})`),
    check("categories_color_hex", sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_user_name_idx").on(t.userId, sql`lower(${t.name})`)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    type: transactionType("type").notNull(),
    amount: money("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    // `no action` (not `restrict`): checked at end of statement, so deleting a user still cascades.
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "no action" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "no action" }),
    note: text("note"),
    // Set on rows created by a recurring rule. The rule id is cleared when the rule is deleted;
    // recurring_date stays so the same occurrence is never created twice.
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, { onDelete: "set null" }),
    recurringDate: date("recurring_date", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date.desc()),
    uniqueIndex("transactions_recurring_occurrence_idx")
      .on(t.recurringRuleId, t.recurringDate)
      .where(sql`${t.recurringRuleId} is not null`),
    index("transactions_account_id_idx").on(t.accountId),
    index("transactions_category_id_idx").on(t.categoryId),
    // Budgets (spent per category and period) and filtered lists/reports (one account, in a date range).
    index("transactions_user_category_date_idx").on(t.userId, t.categoryId, t.date.desc()),
    index("transactions_user_account_date_idx").on(t.userId, t.accountId, t.date.desc()),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    // `no action`, like transactions.account_id: an account with transfers cannot be deleted.
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "no action" }),
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "no action" }),
    amount: money("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, { onDelete: "set null" }),
    recurringDate: date("recurring_date", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("transfers_user_date_idx").on(t.userId, t.date.desc()),
    uniqueIndex("transfers_recurring_occurrence_idx")
      .on(t.recurringRuleId, t.recurringDate)
      .where(sql`${t.recurringRuleId} is not null`),
    index("transfers_from_account_id_idx").on(t.fromAccountId),
    index("transfers_to_account_id_idx").on(t.toAccountId),
    check("transfers_amount_positive", sql`${t.amount} > 0`),
    check("transfers_accounts_differ", sql`${t.fromAccountId} <> ${t.toAccountId}`),
  ],
);

// A savings target. Money is set aside with goal_contributions; the saved amount is computed, never
// stored. A goal is "completed" when saved >= target (derived, not a status). Archived goals stay
// visible; deleted_at hides a used goal that was "deleted" (unused goals are really deleted).
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The owner; only the owner edits, archives or deletes the goal.
    userId: userId(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    targetAmount: money("target_amount").notNull(),
    deadline: date("deadline", { mode: "string" }),
    // Shared goals are visible to the owner's household, and its members can add money to them.
    shared: boolean("shared").notNull().default(false),
    note: text("note"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("goals_user_idx").on(t.userId),
    check("goals_target_positive", sql`${t.targetAmount} > 0`),
    check("goals_name_length", sql`char_length(${t.name}) between 1 and 80`),
  ],
);

// One movement of money between an account and a goal. Like transfers, it is neither income nor
// expense: it only changes the account balance and the goal's saved amount. Rows belong to whoever
// moved the money (user_id), which may differ from the goal's owner on a shared goal.
export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: userId(),
    // Deleting an account keeps its goal movements: account_id becomes null and account_name keeps
    // the name (set by a trigger while the account exists), so the goal history stays intact.
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    accountName: text("account_name").notNull().default(""),
    type: goalContributionType("type").notNull(),
    amount: money("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, { onDelete: "set null" }),
    recurringDate: date("recurring_date", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("goal_contributions_goal_date_idx").on(t.goalId, t.date.desc()),
    index("goal_contributions_user_date_idx").on(t.userId, t.date.desc()),
    index("goal_contributions_account_id_idx").on(t.accountId),
    uniqueIndex("goal_contributions_recurring_occurrence_idx")
      .on(t.recurringRuleId, t.recurringDate)
      .where(sql`${t.recurringRuleId} is not null`),
    check("goal_contributions_amount_positive", sql`${t.amount} > 0`),
  ],
);

// A rule that creates transactions or transfers on a schedule (see lib/recurring). Income and
// expense rules use account_id (+ category_id, tags); transfer rules use from/to accounts.
export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    kind: recurringKind("kind").notNull(),
    amount: money("amount").notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "no action" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "no action" }),
    fromAccountId: uuid("from_account_id").references(() => accounts.id, { onDelete: "no action" }),
    toAccountId: uuid("to_account_id").references(() => accounts.id, { onDelete: "no action" }),
    // Goal rules deposit from account_id into this goal.
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    note: text("note"),
    frequency: recurringFrequency("frequency").notNull(),
    // "Every N days/weeks/months/years".
    intervalCount: integer("interval_count").notNull().default(1),
    // The first occurrence; monthly and yearly rules keep this day of the month.
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    // The next occurrence still to be created.
    nextDueDate: date("next_due_date", { mode: "string" }).notNull(),
    status: recurringStatus("status").notNull().default("active"),
    pausedReason: recurringPausedReason("paused_reason"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("recurring_rules_user_idx").on(t.userId),
    index("recurring_rules_due_idx").on(t.nextDueDate).where(sql`${t.status} = 'active'`),
    index("recurring_rules_account_id_idx").on(t.accountId),
    index("recurring_rules_category_id_idx").on(t.categoryId),
    index("recurring_rules_from_account_id_idx").on(t.fromAccountId),
    index("recurring_rules_to_account_id_idx").on(t.toAccountId),
    index("recurring_rules_goal_id_idx").on(t.goalId),
    check("recurring_rules_amount_positive", sql`${t.amount} > 0`),
    check("recurring_rules_interval_range", sql`${t.intervalCount} between 1 and 365`),
    check("recurring_rules_end_after_start", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    // `kind` is compared as text so this constraint can be created in the same migration that adds 'goal'.
    check(
      "recurring_rules_shape",
      sql`(${t.kind}::text = 'transfer' and ${t.fromAccountId} is not null and ${t.toAccountId} is not null
            and ${t.fromAccountId} <> ${t.toAccountId} and ${t.accountId} is null and ${t.categoryId} is null
            and ${t.goalId} is null)
        or (${t.kind}::text = 'goal' and ${t.accountId} is not null and ${t.goalId} is not null
            and ${t.categoryId} is null and ${t.fromAccountId} is null and ${t.toAccountId} is null)
        or (${t.kind}::text in ('income', 'expense') and ${t.accountId} is not null and ${t.goalId} is null
            and ${t.fromAccountId} is null and ${t.toAccountId} is null)`,
    ),
    check(
      "recurring_rules_paused_reason",
      sql`(${t.status} = 'paused') = (${t.pausedReason} is not null)`,
    ),
  ],
);

export const recurringRuleTags = pgTable(
  "recurring_rule_tags",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => recurringRules.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.ruleId, t.tagId] }),
    index("recurring_rule_tags_tag_id_idx").on(t.tagId),
  ],
);

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.tagId] }),
    index("transaction_tags_tag_id_idx").on(t.tagId),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    period: budgetPeriod("period").notNull().default("monthly"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("budgets_user_category_period_idx").on(t.userId, t.categoryId, t.period),
    check("budgets_amount_positive", sql`${t.amount} > 0`),
  ],
);

// A dismissed budget alert. `period_start` is the first day of the budget's period at the time, so
// a dismissal stops applying once a new week or month begins. Dismissing a warning does not hide
// the exceeded alert of the same period.
export const budgetAlertDismissals = pgTable(
  "budget_alert_dismissals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    level: budgetAlertLevel("level").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_alert_dismissals_budget_period_level_idx").on(t.budgetId, t.periodStart, t.level)],
);

// A household links users who share (read-only) access to each other's data. Everyone keeps
// their own rows and user_id; membership only widens who can read. One household per user.
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: createdAt(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: userId().unique(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

// Invitations are addressed by email so the answer is the same whether or not an account exists
// (no account enumeration). invitee_id is set only when the email belongs to a user; the invitee
// must be signed in to accept, so no token is needed and the email only notifies.
export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeEmail: text("invitee_email").notNull(),
    inviteeId: uuid("invitee_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("household_invites_pair_idx").on(t.inviterId, sql`lower(${t.inviteeEmail})`),
    index("household_invites_invitee_idx").on(t.inviteeId),
  ],
);
