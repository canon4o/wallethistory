-- 0003: row level security, deny all.
-- RLS is enabled on every table with NO policies, so any role subject to RLS (for example
-- Supabase's `anon` / `authenticated` roles used by the public Data API) sees and changes nothing.
-- The app connects as the table owner / a role with BYPASSRLS (Supabase `postgres`), which is not
-- subject to RLS, and enforces per-user isolation in code. FORCE ROW LEVEL SECURITY is
-- intentionally NOT used: it would lock the owner role out too.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
