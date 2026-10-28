import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LoginsTable } from "@/components/admin/LoginsTable";
import { UserActions } from "@/components/admin/UserActions";
import { UserRegionalSettings } from "@/components/admin/UserRegionalSettings";
import { UserSessions } from "@/components/admin/UserSessions";
import { UserBadges } from "@/components/admin/UsersTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { toCurrencyCode } from "@/lib/currencies";
import { listTimezones } from "@/lib/timezones";
import { formatDateTime } from "@/lib/format";
import { getAdminUser } from "@/lib/data/admin";
import { requireAdmin } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admin · User") };
}

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const t = await getT();
  const admin = await requireAdmin();
  const user = await getAdminUser((await params).id);
  if (!user) notFound();
  const isSelf = user.id === admin.id;

  return (
    <>
      <Link
        href="/admin/users"
        className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("All users")}
      </Link>
      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{user.name}</h2>
          <UserBadges user={user} />
        </div>
        <p className="break-all text-sm text-muted">{user.email}</p>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold text-muted">{t("Signed up")}</dt>
            <dd>{formatDateTime(user.createdAt, admin.timezone, t)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">{t("Currency and timezone")}</dt>
            <dd>{user.currency} · {user.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">{t("Last login")}</dt>
            <dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt, admin.timezone, t) : t("Never")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">{t("Blocked since")}</dt>
            <dd>{user.blockedAt ? formatDateTime(user.blockedAt, admin.timezone, t) : t("Not blocked")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">{t("Accounts")}</dt>
            <dd>{user.accountCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">{t("Transactions")}</dt>
            <dd>{user.transactionCount}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">{t("Only counts are shown. Admins cannot see a user's financial data.")}</p>
      </div>

      <div className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2 *:mb-0 *:min-w-0">
        <UserRegionalSettings
          userId={user.id}
          currency={toCurrencyCode(user.currency)}
          timezone={user.timezone}
          timezones={listTimezones()}
        />
        <UserActions user={user} isSelf={isSelf} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h2 className="mb-2 text-sm font-bold">{t("Signed in on")}</h2>
          <UserSessions userId={user.id} sessions={user.sessions} canRevoke={!isSelf} timezone={admin.timezone} />
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">{t("Recent logins")}</h2>
            <Link
              href={`/admin/logins?user=${user.id}`}
              className="inline-flex min-h-10 items-center text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
            >
              {t("See all")}
            </Link>
          </div>
          {user.recentLogins.length === 0 ? (
            <EmptyState title={t("No logins recorded")} description={t("Login history is kept for 90 days.")} />
          ) : (
            <LoginsTable rows={user.recentLogins} showUser={false} timezone={admin.timezone} />
          )}
        </div>
      </div>
    </>
  );
}
