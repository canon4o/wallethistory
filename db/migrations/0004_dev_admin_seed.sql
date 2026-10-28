-- 0004: default admin user.
--
-- !!! DEV ONLY. REMOVE OR CHANGE THIS SEED BEFORE USING A PRODUCTION DATABASE. !!!
-- It creates admin@admin.com with the well-known password "adminpass".
--
-- Self-hosting: the same mechanism (one pre-created admin user inserted via SQL) is how a
-- self-hosted instance bootstraps its first user. For a real self-hosted install, change the
-- email/name/password below (or run an equivalent insert) and log in to change the password.
--
-- Runs after the signup trigger (0002), so the admin also gets the Cash account and default
-- categories. Idempotent: skipped when the email already exists.

-- pgcrypto is used to compute a bcrypt hash in SQL. On Supabase it lives in the `extensions`
-- schema. The resulting `$2a$12$...` hash is verifiable by bcryptjs in the app.
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
--> statement-breakpoint
INSERT INTO public.users (email, name, password_hash, email_verified_at)
SELECT 'admin@admin.com', 'Admin', extensions.crypt('adminpass', extensions.gen_salt('bf', 12)), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE lower(email) = 'admin@admin.com'
);
