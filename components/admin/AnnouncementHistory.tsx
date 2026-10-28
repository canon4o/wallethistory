import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { formatDateTime } from "@/lib/format";
import type { AnnouncementHistoryRow } from "@/lib/data/announcements";
import { EmptyState } from "@/components/ui/EmptyState";
import { getT } from "@/lib/i18n/server";

export async function AnnouncementHistory({
  rows,
  timezone = DEFAULT_TIMEZONE,
}: {
  rows: AnnouncementHistoryRow[];
  timezone?: string;
}) {
  const t = await getT();
  return (
    <section aria-label={t("Previous announcements")} className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">{t("Previous announcements")}</h2>
      {rows.length === 0 ? (
        <EmptyState title={t("No announcements yet")} description={t("Banners you publish are listed here.")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">{t("Announcements, newest first")}</caption>
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">{t("Published")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t("Message")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t("Style")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t("By")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t("Status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.createdAt, timezone, t)}</td>
                  <td className="break-words px-3 py-2">{row.message}</td>
                  <td className="px-3 py-2">{row.level === "warning" ? t("Warning") : t("Information")}</td>
                  <td className="break-all px-3 py-2">{row.createdByEmail ?? <span className="text-muted">{t("Deleted admin")}</span>}</td>
                  <td className="px-3 py-2 font-semibold">{row.active ? t("Showing") : t("Ended")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
