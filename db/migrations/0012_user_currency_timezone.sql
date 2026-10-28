ALTER TYPE "public"."admin_action" ADD VALUE 'regional_settings_changed';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_currency_format" CHECK ("users"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_timezone_length" CHECK (char_length("users"."timezone") between 1 and 64);