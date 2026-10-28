CREATE TYPE "public"."admin_action" AS ENUM('role_changed', 'blocked', 'unblocked', 'deleted', 'sessions_revoked', 'session_revoked', 'signup_enabled', 'signup_disabled', 'announcement_published', 'announcement_cleared', 'data_exported');--> statement-breakpoint
CREATE TYPE "public"."announcement_level" AS ENUM('info', 'warning');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text NOT NULL,
	"target_user_id" uuid,
	"target_email" text,
	"action" "admin_action" NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"level" "announcement_level" DEFAULT 'info' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_message_length" CHECK (char_length("announcements"."message") between 1 and 280)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "announcements_one_active_idx" ON "announcements" USING btree ("active") WHERE "announcements"."active";--> statement-breakpoint
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
