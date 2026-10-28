CREATE TYPE "public"."recurring_frequency" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurring_kind" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."recurring_paused_reason" AS ENUM('manual', 'stale', 'household_link');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "recurring_rule_tags" (
	"rule_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "recurring_rule_tags_rule_id_tag_id_pk" PRIMARY KEY("rule_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "recurring_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"from_account_id" uuid,
	"to_account_id" uuid,
	"note" text,
	"frequency" "recurring_frequency" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_due_date" date NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"paused_reason" "recurring_paused_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_rules_amount_positive" CHECK ("recurring_rules"."amount" > 0),
	CONSTRAINT "recurring_rules_interval_range" CHECK ("recurring_rules"."interval_count" between 1 and 365),
	CONSTRAINT "recurring_rules_end_after_start" CHECK ("recurring_rules"."end_date" is null or "recurring_rules"."end_date" >= "recurring_rules"."start_date"),
	CONSTRAINT "recurring_rules_shape" CHECK (("recurring_rules"."kind" = 'transfer' and "recurring_rules"."from_account_id" is not null and "recurring_rules"."to_account_id" is not null
            and "recurring_rules"."from_account_id" <> "recurring_rules"."to_account_id" and "recurring_rules"."account_id" is null and "recurring_rules"."category_id" is null)
        or ("recurring_rules"."kind" <> 'transfer' and "recurring_rules"."account_id" is not null
            and "recurring_rules"."from_account_id" is null and "recurring_rules"."to_account_id" is null)),
	CONSTRAINT "recurring_rules_paused_reason" CHECK (("recurring_rules"."status" = 'paused') = ("recurring_rules"."paused_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_date" date;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "recurring_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "recurring_date" date;--> statement-breakpoint
ALTER TABLE "recurring_rule_tags" ADD CONSTRAINT "recurring_rule_tags_rule_id_recurring_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rule_tags" ADD CONSTRAINT "recurring_rule_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_rule_tags_tag_id_idx" ON "recurring_rule_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_user_idx" ON "recurring_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_due_idx" ON "recurring_rules" USING btree ("next_due_date") WHERE "recurring_rules"."status" = 'active';--> statement-breakpoint
CREATE INDEX "recurring_rules_account_id_idx" ON "recurring_rules" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_category_id_idx" ON "recurring_rules" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_from_account_id_idx" ON "recurring_rules" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_to_account_id_idx" ON "recurring_rules" USING btree ("to_account_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_recurring_occurrence_idx" ON "transactions" USING btree ("recurring_rule_id","recurring_date") WHERE "transactions"."recurring_rule_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_recurring_occurrence_idx" ON "transfers" USING btree ("recurring_rule_id","recurring_date") WHERE "transfers"."recurring_rule_id" is not null;--> statement-breakpoint

-- Ownership and type rules for a recurring rule, like 0001 (transactions) and 0008 (transfers)
-- combined. SQLSTATE 23514 so the app can map violations to friendly messages.
CREATE FUNCTION public.enforce_recurring_rule_integrity() RETURNS trigger
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
    AND NEW.to_account_id IS NOT DISTINCT FROM OLD.to_account_id THEN
    RETURN NEW;
  END IF;

  IF NEW.kind = 'transfer' THEN
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
    IF NEW.category_id IS NOT NULL THEN
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
CREATE TRIGGER recurring_rules_integrity
BEFORE INSERT OR UPDATE ON public.recurring_rules
FOR EACH ROW EXECUTE FUNCTION public.enforce_recurring_rule_integrity();
--> statement-breakpoint

-- A tag can only be attached to a rule owned by the same user.
CREATE FUNCTION public.enforce_recurring_rule_tag_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rule_owner uuid;
  tag_owner uuid;
BEGIN
  SELECT user_id INTO rule_owner FROM public.recurring_rules WHERE id = NEW.rule_id;
  SELECT user_id INTO tag_owner FROM public.tags WHERE id = NEW.tag_id;
  IF rule_owner IS DISTINCT FROM tag_owner THEN
    RAISE EXCEPTION 'tag and rule belong to different users' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER recurring_rule_tags_integrity
BEFORE INSERT OR UPDATE ON public.recurring_rule_tags
FOR EACH ROW EXECUTE FUNCTION public.enforce_recurring_rule_tag_integrity();
--> statement-breakpoint

-- RLS: deny all, same as every other table (see 0003).
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.recurring_rule_tags ENABLE ROW LEVEL SECURITY;
