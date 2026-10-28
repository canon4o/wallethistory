"use client";

import { useState } from "react";
import { MonthInput } from "@/components/ui/MonthInput";
import { Select } from "@/components/ui/Select";
import { useT } from "@/lib/i18n/client";

type Mode = "month" | "year";
type Pair = { a: string; b: string };

type Props = {
  mode: Mode;
  a: string;
  b: string;
  years: string[];
  /** What each mode compares when it is chosen: this and last month, or this and last year. */
  defaults: Record<Mode, Pair>;
};

/** The Compare / Period / Compared with fields. Changing "Compare" switches the other two to that mode's defaults. */
export function ComparisonPeriodFields({ mode: initialMode, a: initialA, b: initialB, years, defaults }: Props) {
  const t = useT();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pair, setPair] = useState<Pair>({ a: initialA, b: initialB });

  return (
    <>
      <Select
        id="report-mode"
        name="mode"
        label={t("Compare")}
        value={mode}
        onChange={(event) => {
          const next = event.target.value === "year" ? "year" : "month";
          setMode(next);
          setPair(defaults[next]);
        }}
      >
        <option value="month">{t("Months")}</option>
        <option value="year">{t("Years")}</option>
      </Select>
      {mode === "month" ? (
        <>
          <MonthInput id="report-a" name="a" label={t("Period")} value={pair.a} onChange={(value) => setPair({ ...pair, a: value })} required />
          <MonthInput id="report-b" name="b" label={t("Compared with")} value={pair.b} onChange={(value) => setPair({ ...pair, b: value })} required />
        </>
      ) : (
        <>
          <Select id="report-a" name="a" label={t("Period")} value={pair.a} onChange={(event) => setPair({ ...pair, a: event.target.value })}>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </Select>
          <Select id="report-b" name="b" label={t("Compared with")} value={pair.b} onChange={(event) => setPair({ ...pair, b: event.target.value })}>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </Select>
        </>
      )}
    </>
  );
}
