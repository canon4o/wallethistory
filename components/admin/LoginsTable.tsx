import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { formatDateTime } from "@/lib/format";
import type { AdminLoginRow } from "@/lib/data/admin";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";
import { describeUserAgent } from "@/lib/user-agent";

const REASONS: Record<string, string> = {
  unknown_email: msg("Unknown email"),
  bad_password: msg("Wrong password"),
  blocked: msg("Blocked"),
  unverified: msg("Email not verified"),
};

export async function LoginsTable({
  rows,
  showUser = true,
  timezone = DEFAULT_TIMEZONE,
}: {
  rows: AdminLoginRow[];
  showUser?: boolean;
  /** Timezone the times are shown in (the viewing admin's). */
  timezone?: string;
}) {
  const t = await getT();
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{t("Login attempts, newest first")}</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Time")}</th>
            {showUser ? <th scope="col" className="px-3 py-2 font-semibold">{t("User")}</th> : null}
            <th scope="col" className="px-3 py-2 font-semibold">{t("Result")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("IP")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Browser")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.createdAt, timezone, t)}</td>
              {showUser ? (
                <td className="px-3 py-2">
                  {row.userId ? (
                    <Link href={`/admin/users/${row.userId}`} className="font-semibold text-primary-strong hover:underline">
                      {row.userName}
                    </Link>
                  ) : (
                    <span className="text-muted">{t("No account")}</span>
                  )}
                  <p className="break-all text-xs text-muted">{row.email}</p>
                </td>
              ) : null}
              <td className="px-3 py-2">
                {row.success ? (
                  <Badge tone="income">{t("Signed in")}</Badge>
                ) : (
                  <Badge tone="expense">{REASONS[row.reason ?? ""] ? t(REASONS[row.reason ?? ""]) : t("Failed")}</Badge>
                )}
              </td>
              <td className="px-3 py-2">{row.ip ?? t("Unknown")}</td>
              <td className="px-3 py-2">{describeUserAgent(row.userAgent, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
