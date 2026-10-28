ALTER TABLE "goal_contributions" DROP CONSTRAINT "goal_contributions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "goal_contributions" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD COLUMN "account_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
-- Deleting an account no longer needs its goal movements to go: account_id turns null (FK above) and
-- account_name keeps the name. The integrity trigger fills account_name while the account exists.
CREATE OR REPLACE FUNCTION public.enforce_goal_contribution_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  account_row public.accounts%ROWTYPE;
  goal_row public.goals%ROWTYPE;
BEGIN
  -- Editing the note or date of a row must keep working after the goal was archived or unshared,
  -- and so must the account being deleted (account_id set to null by the foreign key).
  IF TG_OP = 'UPDATE'
    AND NEW.goal_id = OLD.goal_id
    AND NEW.user_id = OLD.user_id
    AND NEW.type = OLD.type
    AND NEW.amount = OLD.amount
    AND (NEW.account_id IS NOT DISTINCT FROM OLD.account_id OR NEW.account_id IS NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.account_id IS NULL THEN
    -- Only a row whose account is already gone may stay without one.
    IF TG_OP = 'INSERT' OR OLD.account_id IS NOT NULL THEN
      RAISE EXCEPTION 'account is required' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO account_row FROM public.accounts WHERE id = NEW.account_id;
    IF account_row.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'account does not belong to the contributor' USING ERRCODE = '23514';
    END IF;
    NEW.account_name := account_row.name;
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

-- Before an account is deleted, store its current name on its goal movements (renames included).
CREATE FUNCTION public.keep_goal_contribution_account_name() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.goal_contributions SET account_name = OLD.name WHERE account_id = OLD.id;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER accounts_keep_goal_contribution_name
BEFORE DELETE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.keep_goal_contribution_account_name();
--> statement-breakpoint

UPDATE public.goal_contributions AS c SET account_name = a.name FROM public.accounts AS a WHERE a.id = c.account_id;
