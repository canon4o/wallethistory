-- 0008: a transfer may move money to the account of someone in the sender's household.
-- The from-account must still belong to the transfer owner; the to-account must belong to the
-- owner or to a user who is in the same household as the owner (SQLSTATE 23514, like 0001).
CREATE OR REPLACE FUNCTION public.enforce_transfer_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  from_owner uuid;
  to_owner uuid;
BEGIN
  SELECT user_id INTO from_owner FROM public.accounts WHERE id = NEW.from_account_id;
  SELECT user_id INTO to_owner FROM public.accounts WHERE id = NEW.to_account_id;
  IF from_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'account does not belong to the transfer owner' USING ERRCODE = '23514';
  END IF;
  IF to_owner IS DISTINCT FROM NEW.user_id AND NOT EXISTS (
    SELECT 1
    FROM public.household_members mine
    JOIN public.household_members theirs ON theirs.household_id = mine.household_id
    WHERE mine.user_id = NEW.user_id AND theirs.user_id = to_owner
  ) THEN
    RAISE EXCEPTION 'destination account is not in the transfer owner''s household' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
