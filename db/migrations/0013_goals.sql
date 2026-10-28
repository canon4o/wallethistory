CREATE TYPE "public"."goal_contribution_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
ALTER TYPE "public"."recurring_kind" ADD VALUE 'goal';--> statement-breakpoint
ALTER TYPE "public"."recurring_paused_reason" ADD VALUE 'goal_closed';--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "goal_contribution_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"recurring_rule_id" uuid,
	"recurring_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_contributions_amount_positive" CHECK ("goal_contributions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"target_amount" numeric(14, 2) NOT NULL,
	"deadline" date,
	"shared" boolean DEFAULT false NOT NULL,
	"note" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_target_positive" CHECK ("goals"."target_amount" > 0),
	CONSTRAINT "goals_name_length" CHECK (char_length("goals"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "recurring_rules" DROP CONSTRAINT "recurring_rules_shape";--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_contributions_goal_date_idx" ON "goal_contributions" USING btree ("goal_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goal_contributions_user_date_idx" ON "goal_contributions" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goal_contributions_account_id_idx" ON "goal_contributions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_contributions_recurring_occurrence_idx" ON "goal_contributions" USING btree ("recurring_rule_id","recurring_date") WHERE "goal_contributions"."recurring_rule_id" is not null;--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_rules_goal_id_idx" ON "recurring_rules" USING btree ("goal_id");--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_shape" CHECK (("recurring_rules"."kind"::text = 'transfer' and "recurring_rules"."from_account_id" is not null and "recurring_rules"."to_account_id" is not null
            and "recurring_rules"."from_account_id" <> "recurring_rules"."to_account_id" and "recurring_rules"."account_id" is null and "recurring_rules"."category_id" is null
            and "recurring_rules"."goal_id" is null)
        or ("recurring_rules"."kind"::text = 'goal' and "recurring_rules"."account_id" is not null and "recurring_rules"."goal_id" is not null
            and "recurring_rules"."category_id" is null and "recurring_rules"."from_account_id" is null and "recurring_rules"."to_account_id" is null)
        or ("recurring_rules"."kind"::text in ('income', 'expense') and "recurring_rules"."account_id" is not null and "recurring_rules"."goal_id" is null
            and "recurring_rules"."from_account_id" is null and "recurring_rules"."to_account_id" is null));
--> statement-breakpoint

-- A goal is usable by its owner, and by the members of the owner's household when it is shared.
CREATE FUNCTION public.goal_usable_by(goal uuid, member uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.goals g
    WHERE g.id = goal
      AND (
        g.user_id = member
        OR (
          g.shared
          AND EXISTS (
            SELECT 1
            FROM public.household_members mine
            JOIN public.household_members theirs ON theirs.household_id = mine.household_id
            WHERE mine.user_id = member AND theirs.user_id = g.user_id
          )
        )
      )
  );
$$;
--> statement-breakpoint

-- Ownership rules for a contribution (SQLSTATE 23514, like 0001 and 0008): the account is the
-- contributor's own; a deposit goes to a goal the contributor may use that is neither archived nor
-- deleted. The goal row is locked so deposits cannot race with archiving or deleting it.
CREATE FUNCTION public.enforce_goal_contribution_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  account_owner uuid;
  goal_row public.goals%ROWTYPE;
BEGIN
  -- Editing the note or date of a row must keep working after the goal was archived or unshared.
  IF TG_OP = 'UPDATE'
    AND NEW.goal_id = OLD.goal_id
    AND NEW.user_id = OLD.user_id
    AND NEW.account_id = OLD.account_id
    AND NEW.type = OLD.type
    AND NEW.amount = OLD.amount THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO account_owner FROM public.accounts WHERE id = NEW.account_id;
  IF account_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'account does not belong to the contributor' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO goal_row FROM public.goals WHERE id = NEW.goal_id FOR UPDATE;
  IF NOT FOUND OR goal_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'goal does not exist' USING ERRCODE = '23514';
  END IF;
  IF NEW.type = 'deposit' THEN
    IF goal_row.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'goal is archived' USING ERRCODE = '23514';
    END IF;
    IF NOT public.goal_usable_by(NEW.goal_id, NEW.user_id) THEN
      RAISE EXCEPTION 'goal is not available to the contributor' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER goal_contributions_integrity
BEFORE INSERT OR UPDATE ON public.goal_contributions
FOR EACH ROW EXECUTE FUNCTION public.enforce_goal_contribution_integrity();
--> statement-breakpoint

-- Nobody can take out more than they put in: per goal and contributor, deposits minus withdrawals
-- stays at or above zero. The goal row is locked first so two concurrent writes see each other.
CREATE FUNCTION public.enforce_goal_contribution_balance() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pair record;
  net numeric;
BEGIN
  FOR pair IN
    SELECT DISTINCT goal_id, user_id FROM (
      SELECT OLD.goal_id AS goal_id, OLD.user_id AS user_id WHERE TG_OP IN ('UPDATE', 'DELETE')
      UNION ALL
      SELECT NEW.goal_id, NEW.user_id WHERE TG_OP IN ('INSERT', 'UPDATE')
    ) AS touched
  LOOP
    PERFORM 1 FROM public.goals WHERE id = pair.goal_id FOR UPDATE;
    SELECT coalesce(sum(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0) INTO net
    FROM public.goal_contributions
    WHERE goal_id = pair.goal_id AND user_id = pair.user_id;
    IF net < 0 THEN
      RAISE EXCEPTION 'withdrawal is more than the contributor put into the goal' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER goal_contributions_balance
AFTER INSERT OR UPDATE OR DELETE ON public.goal_contributions
FOR EACH ROW EXECUTE FUNCTION public.enforce_goal_contribution_balance();
--> statement-breakpoint

-- Recurring rules (0011) gain the goal kind: the account must be the owner's and the goal usable by them.
CREATE OR REPLACE FUNCTION public.enforce_recurring_rule_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  account_owner uuid;
  category_owner uuid;
  category_type public.transaction_type;
  from_owner uuid;
  to_owner uuid;
BEGIN
  -- Bookkeeping updates (next date, status) must keep working after the household link is gone,
  -- so the references are only checked when they change.
  IF TG_OP = 'UPDATE'
    AND NEW.kind = OLD.kind
    AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id
    AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
    AND NEW.from_account_id IS NOT DISTINCT FROM OLD.from_account_id
    AND NEW.to_account_id IS NOT DISTINCT FROM OLD.to_account_id
    AND NEW.goal_id IS NOT DISTINCT FROM OLD.goal_id THEN
    RETURN NEW;
  END IF;

  IF NEW.kind::text = 'transfer' THEN
    SELECT user_id INTO from_owner FROM public.accounts WHERE id = NEW.from_account_id;
    SELECT user_id INTO to_owner FROM public.accounts WHERE id = NEW.to_account_id;
    IF from_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'account does not belong to the rule owner' USING ERRCODE = '23514';
    END IF;
    IF to_owner IS DISTINCT FROM NEW.user_id AND NOT EXISTS (
      SELECT 1
      FROM public.household_members mine
      JOIN public.household_members theirs ON theirs.household_id = mine.household_id
      WHERE mine.user_id = NEW.user_id AND theirs.user_id = to_owner
    ) THEN
      RAISE EXCEPTION 'destination account is not in the rule owner''s household' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT user_id INTO account_owner FROM public.accounts WHERE id = NEW.account_id;
    IF account_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'account does not belong to the rule owner' USING ERRCODE = '23514';
    END IF;
    IF NEW.kind::text = 'goal' THEN
      IF NOT public.goal_usable_by(NEW.goal_id, NEW.user_id) THEN
        RAISE EXCEPTION 'goal is not available to the rule owner' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.category_id IS NOT NULL THEN
      SELECT user_id, type INTO category_owner, category_type
      FROM public.categories WHERE id = NEW.category_id;
      IF category_owner IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'category does not belong to the rule owner' USING ERRCODE = '23514';
      END IF;
      IF category_type::text <> NEW.kind::text THEN
        RAISE EXCEPTION 'rule kind % does not match category type %', NEW.kind, category_type
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- RLS: deny all, same as every other table (see 0003).
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
