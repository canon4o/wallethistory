CREATE TYPE "public"."budget_alert_level" AS ENUM('warning', 'exceeded');--> statement-breakpoint
CREATE TABLE "budget_alert_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"level" "budget_alert_level" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "budget_alerts_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "budget_alert_threshold" smallint DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_alert_dismissals" ADD CONSTRAINT "budget_alert_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alert_dismissals" ADD CONSTRAINT "budget_alert_dismissals_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_alert_dismissals_budget_period_level_idx" ON "budget_alert_dismissals" USING btree ("budget_id","period_start","level");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_budget_alert_threshold_range" CHECK ("users"."budget_alert_threshold" between 50 and 99);
--> statement-breakpoint

-- A dismissal must belong to the same user as its budget (SQLSTATE 23514, like 0001 and 0013).
CREATE FUNCTION public.enforce_budget_alert_dismissal_integrity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  budget_owner uuid;
BEGIN
  SELECT user_id INTO budget_owner FROM public.budgets WHERE id = NEW.budget_id;
  IF budget_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'budget does not belong to the dismissal owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER budget_alert_dismissals_integrity
BEFORE INSERT OR UPDATE ON public.budget_alert_dismissals
FOR EACH ROW EXECUTE FUNCTION public.enforce_budget_alert_dismissal_integrity();
--> statement-breakpoint

-- RLS: deny all, same as every other table (see 0003).
ALTER TABLE public.budget_alert_dismissals ENABLE ROW LEVEL SECURITY;
