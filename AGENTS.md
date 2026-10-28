<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## WalletHistory app: project rules

### Product
Personal finance app (logged-in product, separate from the marketing site). Next.js App Router with screens and server code in this repo. Postgres (hosted on Supabase, used ONLY as a database) accessed from the server. Custom authentication. No separate backend service.

### Stack
Next.js 16.3.6, React 19.2, TypeScript strict, Tailwind CSS 4, Drizzle ORM + postgres.js, bcryptjs, nodemailer, zod, react-hook-form, lucide-react. Do not add other dependencies without asking. Do NOT use Supabase Auth, supabase-js, or the Supabase Data API.

### Conventions
- Languages: English (default), Bulgarian (`bg`) and Spanish (`es`). The English text is the translation key: wrap every user-facing string in `t("...")` (`getT()` in Server Components and Server Actions, `useT()` in client components) or `msg("...")` for labels defined outside a component, and add its `bg` and `es` text to the single file `lib/i18n/translations.json` (a test fails when a key is missing). The language lives only in the `wh_locale` cookie (never in the database) and falls back to `Accept-Language`, then English. Numbers and currency are never localized. Dates in lists use the same layout with short translated month names (`lib/format.ts`, pass `t`). Date fields are native `<input type="date">` (their format and week start follow the browser). Seeded defaults (Cash account, default categories) and CSV headers stay English.
- Light and dark themes (user setting: system, light or dark; see `lib/theme.ts`, tokens in `app/globals.css`). Always use semantic color tokens so both themes work.
- Server Components by default; `"use client"` only when needed (forms, modals, interactive filters).
- Only server code imports from `db/`. Reads live in `lib/data/*`. Writes are Server Actions in `lib/actions/*`. Pages and components never query the database directly.
- Every Server Action and data function: call `requireUser()`, scope every query by the current user's id, and verify that any id coming from the client belongs to that user.
- Every Server Action: validate with zod, write, `revalidatePath`, return a typed `{ ok }` result. Never expose raw DB errors.
- Zod schemas live in `lib/validation/*` and are shared by forms and actions. Environment variables are validated in `lib/env.ts` and documented in `.env.example`.
- Auth: passwords hashed with bcryptjs (cost 12, max 72 chars). Sessions are stored in the database as SHA-256 token hashes; the raw token lives only in an httpOnly cookie. `proxy.ts` (not `middleware.ts`) only checks cookie presence; real checks happen in `getCurrentUser()` on the server. One-time email tokens are stored hashed, single-use, and expire.
- Emails are sent with nodemailer using SMTP env vars; if `SMTP_HOST` is empty, print emails to the console. Never let an email failure break the main action.
- Users log in with email + password and have a required display `name`. No username. Never return password or token hashes to the client.
- Never commit secrets. `.env*` is gitignored; keep `.env.example` up to date.
- Database changes only via SQL migration files in `db/migrations/`. RLS is enabled on every table with no policies (deny all); the app connects as the owner role and enforces isolation in code.
- Postgres enums: `transaction_type` (income, expense), `budget_period` (weekly, monthly), `token_type` (email_verification, password_reset).
- Deleting a user must delete all their data (FK cascade from `users`).
- Each user has a display `currency` (USD, EUR or GBP, see `lib/currencies.ts`) and an IANA `timezone` (`users.currency`, `users.timezone`; default USD / UTC). Currency is only a label: nothing is converted. Pass the user's currency to the formatters in `lib/format.ts`, and use `todayISO(user.timezone)` for "today".
- Budget alerts (in-app only): computed on every read from `listBudgets()`, never stored or checked at write time (`lib/data/budget-alerts.ts`, level logic in `lib/budget-alerts.ts`, in integer cents). Per-user settings `users.budget_alerts_enabled` / `budget_alert_threshold` (50..99); a dismissal is a `budget_alert_dismissals` row keyed by the budget's current `period_start` and level, so it resets every new week/month and a dismissed warning never hides a later exceeded.
- Every category has a required `type` (income/expense), a required icon (key from `lib/category-icons.ts`), and a color. A category can only be used on transactions of the same type. Budget categories must be expense categories.
- Money is `numeric(14,2)`, always positive; `type` (income/expense) decides the sign. Account balance is computed, never stored.
- Categories are split by type (income/expense); a transaction's category must match its own type. Budgets apply to expense categories only.
- Goals (`goals`, `goal_contributions`): a contribution moves money between one of the contributor's accounts and a goal (type `deposit` or `withdrawal`, amount always positive). It is neither income nor expense and is subtracted from the account balance, like a transfer. Saved amounts are computed, never stored; "completed" means saved >= target. A shared goal is visible to the owner's household and any member can deposit from their own accounts; only the owner edits it, and nobody edits another person's contributions. A goal with money in it cannot be deleted; an empty goal that was never used is deleted, a used one is soft deleted (`deleted_at`), and archived goals stay visible. Soft-deleted goals appear in a Deleted filter on the Goals page (owner only), where they can be restored or, when none of their movements is on an existing account, removed permanently. Deleting an account keeps its goal movements (`goal_contributions.account_id` becomes null, `account_name` keeps the name).
- Every list page has empty, loading, and error states.
- No `any`. `npm run lint` and `npm run build` must pass before finishing any task.
- Tests are written in the same change that adds the feature, never deferred. Unit/integration tests use `vitest` + Testing Library; E2E uses Playwright against a seeded test database; never send real email in tests. `vitest` enforces a 95% line/branch coverage threshold on `lib/auth`, `lib/data`, `lib/actions`, `lib/validation`, `lib/email` (logic), `lib/format.ts`, `lib/category-icons.ts`, and `db` helpers — not a repo-wide threshold.

### Design tokens (Tailwind 4 `@theme` in `app/globals.css`)
`primary #1aaaba`, `primary-light #42b4c4`, `income #9cca56`, `expense #df697f`, `planning #ea9150` (future), `goals #ffd100`, `accounts #337ab7`. Font: Comfortaa via `next/font/google`, fallback `system-ui, sans-serif`. Use semantic token names in components, never raw hex values.

### UI style
Compact, data-dense product UI (not marketing). Mobile first. Visible focus states, labeled inputs, touch targets of at least 40px.

### Working style
Small, reviewable changes. Keep it simple; no speculative features. If something is unclear or docs contradict these rules, ask before guessing.