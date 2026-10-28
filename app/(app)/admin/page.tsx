import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import Link from "next/link";
import { ActivityChart } from "@/components/admin/ActivityChart";
import { StatCard } from "@/components/admin/StatCard";
import { UserBreakdown } from "@/components/admin/UserBreakdown";
import { UserBadges } from "@/components/admin/UsersTable";
import { formatDateTime } from "@/lib/format";
import { getAdminOverview, getAdminOverviewCharts, listAdminUsers, listLoginEvents } from "@/lib/data/admin";
import { OVERVIEW_RANGES, parseOverviewRange } from "@/lib/validation/admin";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admin") };
}

const RECENT = 5;

function Panel({ title, action, children }: { title: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold">{title}</h2>
        {action ? (
          <Link href={action.href} className="text-xs font-semibold text-primary-strong hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const t = await getT();
  const admin = await requireAdmin();
  const range = parseOverviewRange(await searchParams);
  const [overview, charts, recentUsers, failedLogins] = await Promise.all([
    getAdminOverview(),
    getAdminOverviewCharts(range),
    listAdminUsers({ status: "all", page: 1 }),
    listLoginEvents({ result: "failed", page: 1 }),
  ]);
  return (
    <div className="space-y-3">
      <section aria-label={t("Overview")} className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Users")} value={overview.totalUsers} />
        <StatCard
          label={t("New in 7 days")}
          value={overview.newLast7Days}
          trend={{ current: overview.newLast7Days, previous: overview.newPrevious7Days, period: t("previous 7 days") }}
          hint={t("{count} in 30 days", { count: overview.newLast30Days })}
        />
        <StatCard
          label={t("Failed logins, 24 hours")}
          value={overview.failedLogins24h}
          trend={{
            current: overview.failedLogins24h,
            previous: overview.failedLoginsPrevious24h,
            period: t("previous 24 hours"),
            lowerIsBetter: true,
          }}
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title={t("Activity")}>
            <nav aria-label={t("Chart range")} className="mb-3 flex gap-2">
              {OVERVIEW_RANGES.map((days) => (
                <Link
                  key={days}
                  href={days === 30 ? "/admin" : `/admin?range=${days}`}
                  aria-current={days === range ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    days === range ? "border-primary-strong bg-primary-soft text-primary-soft-foreground" : "border-border bg-surface hover:bg-background"
                  }`}
                >
                  {days} {t("days")}
                </Link>
              ))}
            </nav>
            <ActivityChart charts={charts} />
          </Panel>
        </div>
        <Panel title={t("Users by status")}>
          <UserBreakdown overview={overview} />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={t("Recent signups")} action={{ href: "/admin/users", label: t("All users") }}>
          {recentUsers.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t("No users yet.")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentUsers.items.slice(0, RECENT).map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                  <div className="min-w-0">
                    <Link href={`/admin/users/${user.id}`} className="font-semibold text-primary-strong hover:underline">
                      {user.name}
                    </Link>
                    <p className="break-all text-xs text-muted">{user.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <UserBadges user={user} />
                    <span className="text-xs text-muted">{formatDateTime(user.createdAt, admin.timezone, t)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t("Latest failed logins")} action={{ href: "/admin/logins?result=failed", label: t("All logins") }}>
          {failedLogins.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t("No failed logins.")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {failedLogins.items.slice(0, RECENT).map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                  <div className="min-w-0">
                    {event.userId ? (
                      <Link href={`/admin/users/${event.userId}`} className="font-semibold text-primary-strong hover:underline">
                        {event.userName}
                      </Link>
                    ) : (
                      <span className="text-muted">{t("No account")}</span>
                    )}
                    <p className="break-all text-xs text-muted">{event.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs text-muted">
                    <span>{event.ip ?? t("Unknown IP")}</span>
                    <span>{formatDateTime(event.createdAt, admin.timezone, t)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
