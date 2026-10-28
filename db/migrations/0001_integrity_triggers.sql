-- 0001: cross-table integrity rules that plain constraints cannot express.
-- Defense in depth: the app validates the same rules, the database refuses to store a violation.
-- All violations raise SQLSTATE 23514 (check_violation) so the app can map them to friendly messages.

-- A transaction must reference an account (and optional category) owned by the same user,
-- and its type must match its category's type (income category -> income transaction).
CREATE FUNCTION public.enforce_transaction_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  account_owner uuid;
  category_owner uuid;
  category_type public.transaction_type;
BEGIN
  SELECT user_id INTO account_owner FROM public.accounts WHERE id = NEW.account_id;
  IF account_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'account does not belong to the transaction owner' USING ERRCODE = '23514';
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT user_id, type INTO category_owner, category_type
    FROM public.categories WHERE id = NEW.category_id;
    IF category_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'category does not belong to the transaction owner' USING ERRCODE = '23514';
    END IF;
    IF category_type <> NEW.type THEN
      RAISE EXCEPTION 'transaction type % does not match category type %', NEW.type, category_type
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transactions_integrity
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_integrity();
--> statement-breakpoint

-- A category's type is locked after creation: transactions and budgets already depend on it.
CREATE FUNCTION public.lock_category_type() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'category type cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER categories_lock_type
BEFORE UPDATE OF type ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.lock_category_type();
--> statement-breakpoint

-- Budgets track expenses only, and the category must belong to the budget's owner.
CREATE FUNCTION public.enforce_budget_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  category_owner uuid;
  category_type public.transaction_type;
BEGIN
  SELECT user_id, type INTO category_owner, category_type
  FROM public.categories WHERE id = NEW.category_id;
  IF category_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'category does not belong to the budget owner' USING ERRCODE = '23514';
  END IF;
  IF category_type <> 'expense' THEN
    RAISE EXCEPTION 'budgets require an expense category' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER budgets_integrity
BEFORE INSERT OR UPDATE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.enforce_budget_integrity();
--> statement-breakpoint

-- A tag can only be attached to a transaction owned by the same user.
CREATE FUNCTION public.enforce_transaction_tag_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  transaction_owner uuid;
  tag_owner uuid;
BEGIN
  SELECT user_id INTO transaction_owner FROM public.transactions WHERE id = NEW.transaction_id;
  SELECT user_id INTO tag_owner FROM public.tags WHERE id = NEW.tag_id;
  IF transaction_owner IS DISTINCT FROM tag_owner THEN
    RAISE EXCEPTION 'tag and transaction belong to different users' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transaction_tags_integrity
BEFORE INSERT OR UPDATE ON public.transaction_tags
FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_tag_integrity();
