import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { formatDateTime } from "@/lib/format";
import type { AdminUserRow } from "@/lib/data/admin";
import { getT } from "@/lib/i18n/server";

export async function UserBadges({ user }: { user: Pick<AdminUserRow, "role" | "verified" | "blocked"> }) {
  const t = await getT();
  return (
    <span className="flex flex-wrap gap-1">
      {user.role === "admin" ? <Badge tone="accounts">{t("Admin")}</Badge> : null}
      {user.blocked ? <Badge tone="expense">{t("Blocked")}</Badge> : null}
      {!user.verified ? <Badge>{t("Not verified")}</Badge> : null}
    </span>
  );
}

export async function UsersTable({ rows, timezone = DEFAULT_TIMEZONE }: { rows: AdminUserRow[]; timezone?: string }) {
  const t = await getT();
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{t("Users, newest first")}</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">{t("User")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Status")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Last login")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Signed up")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((user) => (
            <tr key={user.id}>
              <td className="px-3 py-2">
                <Link href={`/admin/users/${user.id}`} className="font-semibold text-primary-strong hover:underline">
                  {user.name}
                </Link>
                <p className="break-all text-xs text-muted">{user.email}</p>
              </td>
              <td className="px-3 py-2">
                <UserBadges user={user} />
              </td>
              <td className="whitespace-nowrap px-3 py-2">{user.lastLoginAt ? formatDateTime(user.lastLoginAt, timezone, t) : t("Never")}</td>
              <td className="whitespace-nowrap px-3 py-2">{formatDateTime(user.createdAt, timezone, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
