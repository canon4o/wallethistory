"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "@/lib/format";
import type { AdminOverviewCharts } from "@/lib/data/admin";
import { useT } from "@/lib/i18n/client";
import { msg, type Translate } from "@/lib/i18n/translate";

const SERIES = [
  { key: "signups", label: msg("New users"), color: "var(--color-primary)" },
  { key: "logins", label: msg("Logins"), color: "var(--color-income)" },
  { key: "failedLogins", label: msg("Failed logins"), color: "var(--color-expense)" },
] as const;

type Point = { day: string } & Record<(typeof SERIES)[number]["key"], number>;

const AXIS = { fill: "var(--color-muted)", fontSize: 12 };
const GRID = "var(--color-border)";

const shortDay = (day: string, t: Translate) => formatDate(day, t).replace(/,? \d{4}$/, "");

export function ActivityChart({ charts }: { charts: AdminOverviewCharts }) {
  const t = useT();
  const data: Point[] = charts.signups.map((point, index) => ({
    day: point.day,
    signups: point.value,
    logins: charts.logins[index].value,
    failedLogins: charts.failedLogins[index].value,
  }));
  const totals = SERIES.map((item) => ({ ...item, total: charts[item.key].reduce((sum, point) => sum + point.value, 0) }));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {totals.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-full" style={{ background: item.color }} />
            <span className="text-muted">{t(item.label)}</span>
            <span className="font-bold tabular-nums">{item.total}</span>
          </li>
        ))}
      </ul>
      <div
        role="img"
        aria-label={t("Per day over the last {days} days: {summary}.", {
          days: charts.days,
          summary: totals.map((item) => `${item.total} ${t(item.label).toLowerCase()}`).join(", "),
        })}
        className="h-64 w-full min-w-0"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(day) => shortDay(String(day), t)} minTickGap={32} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <Tooltip
              labelFormatter={(day) => formatDate(String(day), t)}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                fontSize: 12,
              }}
            />
            {SERIES.map((item) => (
              <Line
                key={item.key}
                dataKey={item.key}
                name={t(item.label)}
                type="monotone"
                stroke={item.color}
                strokeWidth={2}
                dot={charts.days <= 30 ? { r: 2, fill: item.color } : false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
