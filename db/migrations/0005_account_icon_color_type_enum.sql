-- 0005: accounts get a color and an icon (like categories) and `type` becomes the account_type enum.
-- Existing rows are backfilled with a color and icon per type. Icon keys come from lib/account-icons.ts.

CREATE TYPE "public"."account_type" AS ENUM('cash', 'bank', 'card', 'savings', 'other');--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_type_check";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "type" SET DATA TYPE "public"."account_type" USING "type"::"public"."account_type";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "icon" text;--> statement-breakpoint
UPDATE "accounts" SET
  "color" = CASE "type" WHEN 'cash' THEN '#9cca56' WHEN 'bank' THEN '#337ab7' WHEN 'card' THEN '#ea9150' WHEN 'savings' THEN '#1aaaba' ELSE '#6b7c85' END,
  "icon" = CASE "type" WHEN 'cash' THEN 'banknote' WHEN 'bank' THEN 'landmark' WHEN 'card' THEN 'credit-card' WHEN 'savings' THEN 'piggy-bank' ELSE 'wallet' END;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "icon" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_color_hex" CHECK ("accounts"."color" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
-- The signup trigger now has to fill the new required columns.
CREATE OR REPLACE FUNCTION public.create_user_defaults() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (user_id, name, type, color, icon, initial_balance)
  VALUES (NEW.id, 'Cash', 'cash', '#9cca56', 'banknote', 0);

  INSERT INTO public.categories (user_id, type, name, color, icon) VALUES
    -- Income
    (NEW.id, 'income',  'Salary',          '#9cca56', 'banknote'),
    (NEW.id, 'income',  'Freelance',       '#1aaaba', 'laptop'),
    (NEW.id, 'income',  'Gifts',           '#8e6bbf', 'gift'),
    (NEW.id, 'income',  'Refunds',         '#337ab7', 'undo-2'),
    (NEW.id, 'income',  'Other Income',    '#6b7c85', 'ellipsis'),
    -- Expense
    (NEW.id, 'expense', 'Food & Dining',   '#ea9150', 'utensils'),
    (NEW.id, 'expense', 'Groceries',       '#9cca56', 'shopping-cart'),
    (NEW.id, 'expense', 'Rent',            '#337ab7', 'home'),
    (NEW.id, 'expense', 'Utilities',       '#ffd100', 'zap'),
    (NEW.id, 'expense', 'Transport',       '#1aaaba', 'car'),
    (NEW.id, 'expense', 'Health',          '#df697f', 'heart-pulse'),
    (NEW.id, 'expense', 'Entertainment',   '#8e6bbf', 'film'),
    (NEW.id, 'expense', 'Shopping',        '#ea9150', 'shopping-bag'),
    (NEW.id, 'expense', 'Education',       '#337ab7', 'graduation-cap'),
    (NEW.id, 'expense', 'Travel',          '#1aaaba', 'plane'),
    (NEW.id, 'expense', 'Other Expense',   '#6b7c85', 'ellipsis');

  RETURN NEW;
END;
$$;
