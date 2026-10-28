import Link from "next/link";
import type { AdminOverview } from "@/lib/data/admin";
import { getT } from "@/lib/i18n/server";

/** Active, not verified and blocked users as one stacked bar plus a legend with the counts. */
export async function UserBreakdown({ overview }: { overview: Pick<AdminOverview, "totalUsers" | "active" | "unverified" | "blocked"> }) {
  const t = await getT();
  const blocked = overview.blocked;
  // `unverified` also counts blocked users who never verified; the bar needs mutually exclusive parts.
  const unverified = Math.max(0, overview.totalUsers - overview.active - blocked);
  const parts = [
    { label: t("Active"), value: overview.active, bar: "bg-income", dot: "bg-income", href: undefined },
    { label: t("Not verified"), value: unverified, bar: "bg-planning", dot: "bg-planning", href: "/admin/users?status=unverified" },
    { label: t("Blocked"), value: blocked, bar: "bg-expense", dot: "bg-expense", href: "/admin/users?status=blocked" },
  ];
  const total = overview.totalUsers;
  return (
    <div>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t("No users yet.")}</p>
      ) : (
        <div
          role="img"
          aria-label={t("Users: {summary}", { summary: parts.map((part) => `${part.value} ${part.label.toLowerCase()}`).join(", ") })}
          className="flex h-4 w-full overflow-hidden rounded-full bg-background"
        >
          {parts
            .filter((part) => part.value > 0)
            .map((part) => (
              <div key={part.label} className={part.bar} style={{ width: `${(part.value / total) * 100}%` }} />
            ))}
        </div>
      )}
      <ul className="mt-3 space-y-2 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={`size-3 rounded-full ${part.dot}`} />
              {part.href ? (
                <Link href={part.href} className="font-semibold text-primary-strong hover:underline">
                  {part.label}
                </Link>
              ) : (
                part.label
              )}
            </span>
            <span className="tabular-nums">
              <span className="font-bold">{part.value}</span>
              <span className="text-muted"> · {total === 0 ? "0" : Math.round((part.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
