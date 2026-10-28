import type { ReactNode } from "react";

export function ReportCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = `report-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 id={id} className="text-sm font-bold">
          {title}
        </h2>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

type Tone = "income" | "expense" | "accounts";
const TONES: Record<Tone, string> = { income: "text-income-text", expense: "text-expense-text", accounts: "text-accounts" };

export function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums ${tone ? TONES[tone] : ""}`}>{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

export const tableClass = "w-full min-w-max text-sm";
export const thClass = "px-2 py-2 text-left text-xs font-semibold text-muted first:pl-0 last:pr-0";
export const thRightClass = "px-2 py-2 text-right text-xs font-semibold text-muted last:pr-0";
export const tdClass = "px-2 py-2 first:pl-0 last:pr-0";
export const tdRightClass = "px-2 py-2 text-right tabular-nums last:pr-0";
