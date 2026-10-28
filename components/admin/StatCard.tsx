import type { ReactNode } from "react";
import type { Translate } from "@/lib/i18n/translate";
import { getT } from "@/lib/i18n/server";

type Trend = { current: number; previous: number; period: string; lowerIsBetter?: boolean };

function trendLine({ current, previous, period, lowerIsBetter = false }: Trend, t: Translate) {
  const diff = current - previous;
  if (diff === 0) return <p className="mt-1 text-xs text-muted">{t("No change vs {period}", { period })}</p>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <p className={`mt-1 text-xs font-semibold ${good ? "text-income-text" : "text-expense-text"}`}>
      <span aria-hidden="true">{diff > 0 ? "▲" : "▼"}</span> {diff > 0 ? "+" : "-"}
      {Math.abs(diff)} <span className="font-normal text-muted">{t("vs {period}", { period })}</span>
    </p>
  );
}

export async function StatCard({ label, value, hint, trend }: { label: string; value: ReactNode; hint?: string; trend?: Trend }) {
  const t = await getT();
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {trend ? trendLine(trend, t) : null}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
