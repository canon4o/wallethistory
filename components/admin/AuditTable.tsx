import Link from "next/link";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { formatDateTime } from "@/lib/format";
import type { AdminAuditRow } from "@/lib/data/admin";
import { getT } from "@/lib/i18n/server";
import { msg, type Translate } from "@/lib/i18n/translate";

const LABELS: Record<string, string> = {
  role_changed: msg("Changed role"),
  blocked: msg("Blocked"),
  unblocked: msg("Unblocked"),
  deleted: msg("Deleted user"),
  sessions_revoked: msg("Signed out everywhere"),
  session_revoked: msg("Signed out one device"),
  signup_enabled: msg("Turned signups on"),
  signup_disabled: msg("Turned signups off"),
  announcement_published: msg("Published announcement"),
  announcement_cleared: msg("Cleared announcement"),
  data_exported: msg("Exported user data"),
  regional_settings_changed: msg("Changed currency or timezone"),
  email_verified: msg("Verified email"),
};

/** A short, safe summary of the stored detail. Only known keys are shown. */
export function describeDetail(action: string, detail: Record<string, unknown> | null, t: Translate): string {
  if (!detail) return "";
  if (action === "role_changed") return `${String(detail.from)} → ${String(detail.to)}`;
  if (action === "sessions_revoked") return t("{count, plural, one {# session} other {# sessions}}", { count: Number(detail.count ?? 0) });
  if (action === "deleted" && Number(detail.transfersRemoved) > 0) {
    return t("{count, plural, one {# incoming transfer removed} other {# incoming transfers removed}}", {
      count: Number(detail.transfersRemoved),
    });
  }
  if (action === "regional_settings_changed") {
    const pair = (value: unknown) => {
      const { from, to } = (value ?? {}) as { from?: unknown; to?: unknown };
      return from === to ? null : `${String(from)} → ${String(to)}`;
    };
    return [pair(detail.currency), pair(detail.timezone)].filter(Boolean).join(", ");
  }
  if (action === "data_exported") return t("Reason: {reason}", { reason: String(detail.reason ?? "") });
  if (action === "announcement_published") return `${String(detail.level ?? "")}: ${String(detail.message ?? "")}`;
  return "";
}

export async function AuditTable({ rows, timezone = DEFAULT_TIMEZONE }: { rows: AdminAuditRow[]; timezone?: string }) {
  const t = await getT();
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{t("Admin actions, newest first")}</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Time")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Admin")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Action")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("User")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Details")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.createdAt, timezone, t)}</td>
              <td className="break-all px-3 py-2">{row.actorEmail}</td>
              <td className="px-3 py-2 font-semibold">{LABELS[row.action] ? t(LABELS[row.action]) : row.action}</td>
              <td className="break-all px-3 py-2">
                {row.targetEmail ? (
                  row.targetUserId && row.action !== "deleted" ? (
                    <Link href={`/admin/users/${row.targetUserId}`} className="text-primary-strong hover:underline">
                      {row.targetEmail}
                    </Link>
                  ) : (
                    row.targetEmail
                  )
                ) : (
                  <span className="text-muted">{t("Everyone")}</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted">{describeDetail(row.action, row.detail, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
