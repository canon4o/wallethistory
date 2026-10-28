CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_amount_positive" CHECK ("transfers"."amount" > 0),
	CONSTRAINT "transfers_accounts_differ" CHECK ("transfers"."from_account_id" <> "transfers"."to_account_id")
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_user_date_idx" ON "transfers" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transfers_from_account_id_idx" ON "transfers" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "transfers_to_account_id_idx" ON "transfers" USING btree ("to_account_id");
--> statement-breakpoint

-- Both accounts of a transfer must belong to the transfer's owner (SQLSTATE 23514, like 0001).
CREATE FUNCTION public.enforce_transfer_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  from_owner uuid;
  to_owner uuid;
BEGIN
  SELECT user_id INTO from_owner FROM public.accounts WHERE id = NEW.from_account_id;
  SELECT user_id INTO to_owner FROM public.accounts WHERE id = NEW.to_account_id;
  IF from_owner IS DISTINCT FROM NEW.user_id OR to_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'account does not belong to the transfer owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_integrity
BEFORE INSERT OR UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.enforce_transfer_integrity();
--> statement-breakpoint

-- RLS: deny all, same as every other table (see 0003).
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
