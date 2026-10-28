CREATE TYPE "public"."login_failure_reason" AS ENUM('unknown_email', 'bad_password', 'blocked', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email_attempted" text NOT NULL,
	"success" boolean NOT NULL,
	"reason" "login_failure_reason",
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_events_created_at_idx" ON "login_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events" USING btree ("user_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- The dev seed user from 0004 becomes the first admin. Any other admin is promoted by
-- updating users.role directly in the database.
UPDATE public.users SET role = 'admin' WHERE lower(email) = 'admin@admin.com';
