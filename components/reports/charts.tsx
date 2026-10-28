"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRegion } from "@/components/layout/RegionProvider";
import { formatCompactMoney, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/client";

// Colors are the design tokens (CSS variables), except category and account colors, which are data.
const GRID = "var(--color-border)";
const AXIS = { fill: "var(--color-muted)", fontSize: 12 };
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  fontSize: 12,
};

/** Tooltip and axis formatters in the signed-in user's currency. */
function useMoneyFormatters() {
  const { currency } = useRegion();
  return {
    money: (value: unknown) => formatMoney(Number(value), currency),
    axisMoney: (value: unknown) => formatCompactMoney(Number(value), currency),
  };
}

/** Every chart has a text alternative: the same numbers are in the table next to it. */
function ChartFrame({ label, children, height = "h-64" }: { label: string; children: ReactNode; height?: string }) {
  return (
    <div role="img" aria-label={label} className={`${height} w-full min-w-0`}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export type CashFlowPoint = { label: string; income: number; expense: number; net: number };

export function CashFlowChart({ data, height }: { data: CashFlowPoint[]; height?: string }) {
  const t = useT();
  const { money, axisMoney } = useMoneyFormatters();
  return (
    <ChartFrame
      label={t("Income and expenses per month, with the net as a line. The same numbers are in the table below.")}
      height={height}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={axisMoney} />
        <Tooltip formatter={money} contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-background)" }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke={GRID} />
        <Bar dataKey="income" name={t("Income")} fill="var(--color-income)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name={t("Expenses")} fill="var(--color-expense)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line
          dataKey="net"
          name={t("Net")}
          type="monotone"
          stroke="var(--color-primary-strong)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-primary-strong)" }}
        />
      </ComposedChart>
    </ChartFrame>
  );
}

export type DonutSlice = { name: string; value: number; color: string };

export function SpendingDonut({ data, label, height = "h-56" }: { data: DonutSlice[]; label: string; height?: string }) {
  const { money } = useMoneyFormatters();
  return (
    <ChartFrame label={label} height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 1 : 0} stroke="var(--color-surface)">
          {data.map((slice) => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip formatter={money} contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ChartFrame>
  );
}

export type ComparisonPoint = { name: string; a: number; b: number };

export function ComparisonChart({ data, aLabel, bLabel }: { data: ComparisonPoint[]; aLabel: string; bLabel: string }) {
  const t = useT();
  const { money, axisMoney } = useMoneyFormatters();
  return (
    <ChartFrame
      label={t("Top categories in {a} compared with {b}. The same numbers are in the table below.", { a: aLabel, b: bLabel })}
      height={data.length > 4 ? "h-96" : "h-64"}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={axisMoney} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={96} />
        <Tooltip formatter={money} contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-background)" }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="a" name={aLabel} fill="var(--color-primary)" radius={[0, 3, 3, 0]} maxBarSize={16} />
        <Bar dataKey="b" name={bLabel} fill="var(--color-muted)" radius={[0, 3, 3, 0]} maxBarSize={16} />
      </BarChart>
    </ChartFrame>
  );
}

export type BalancePoint = { label: string; total: number } & Record<string, number | string>;

export function BalanceChart({ data }: { data: BalancePoint[] }) {
  const t = useT();
  const { money, axisMoney } = useMoneyFormatters();
  return (
    <ChartFrame label={t("Total balance at the end of each month. The same numbers are in the table below.")}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={axisMoney} />
        <Tooltip formatter={money} contentStyle={TOOLTIP_STYLE} />
        <ReferenceLine y={0} stroke={GRID} />
        <Area
          dataKey="total"
          name={t("Balance")}
          type="monotone"
          stroke="var(--color-accounts)"
          strokeWidth={2}
          fill="var(--color-accounts)"
          fillOpacity={0.14}
          dot={{ r: 3, fill: "var(--color-accounts)" }}
        />
      </AreaChart>
    </ChartFrame>
  );
}

export type AccountLine = { key: string; name: string; color: string };

export function AccountsBalanceChart({ data, lines }: { data: BalancePoint[]; lines: AccountLine[] }) {
  const t = useT();
  const { money, axisMoney } = useMoneyFormatters();
  return (
    <ChartFrame label={t("Balance of each account at the end of each month. The same numbers are in the table below.")}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={axisMoney} />
        <Tooltip formatter={money} contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke={GRID} />
        {lines.map((line) => (
          <Line
            key={line.key}
            dataKey={line.key}
            name={line.name}
            type="monotone"
            stroke={line.color}
            strokeWidth={2}
            dot={{ r: 3, fill: line.color }}
          />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

export type GoalHistoryPoint = { label: string; saved: number };

/** How much is saved in a goal after each day with a movement, against its target. */
export function GoalHistoryChart({ data, target }: { data: GoalHistoryPoint[]; target: number }) {
  const t = useT();
  const { money, axisMoney } = useMoneyFormatters();
  return (
    <ChartFrame
      label={t("Saved amount in the goal over time, with the target as a dashed line. The same movements are listed below.")}
      height="h-56"
    >
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={axisMoney}
          domain={[0, (max: number) => Math.max(max, target)]}
        />
        <Tooltip formatter={money} contentStyle={TOOLTIP_STYLE} />
        <ReferenceLine y={target} stroke="var(--color-muted)" strokeDasharray="4 4" />
        <Area
          dataKey="saved"
          name={t("Saved")}
          type="stepAfter"
          stroke="var(--color-primary-strong)"
          strokeWidth={2}
          fill="var(--color-goals)"
          fillOpacity={0.35}
          dot={{ r: 3, fill: "var(--color-primary-strong)" }}
        />
      </AreaChart>
    </ChartFrame>
  );
}

export type ForecastPoint = { label: string; actual: number | null; forecast: number | null };

/** Spending per month so far (solid) and the projection for the months ahead (dashed). */
export function ForecastChart({ data }: { data: ForecastPoint[] }) {
  const t = useT();
  const { money, axisMoney } = useMoneyFormatters();
  return (
    <ChartFrame label={t("Actual and projected spending per month. The same numbers are in the table below.")}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={axisMoney}
          // Not from $0: a little room around the data keeps month-to-month changes visible.
          domain={[(min: number) => Math.floor(min * 0.9), (max: number) => Math.ceil(max * 1.05)]}
        />
        <Tooltip formatter={money} contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Line
          dataKey="actual"
          name={t("Actual spending")}
          type="monotone"
          stroke="var(--color-expense)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-expense)" }}
          connectNulls={false}
        />
        <Line
          dataKey="forecast"
          name={t("Projected spending")}
          type="monotone"
          stroke="var(--color-planning)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 3, fill: "var(--color-planning)" }}
          connectNulls={false}
        />
      </LineChart>
    </ChartFrame>
  );
}
