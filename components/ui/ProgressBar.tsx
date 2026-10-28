import { cn } from "./cn";

/** Diagonal dark stripes over the color behind them, like construction tape: "not yet, but planned". */
export const PLANNED_STRIPES = {
  backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgb(0 0 0 / 0.3) 3px 6px)",
} as const;

type ProgressBarProps = {
  /** Amount used so far. */
  value: number;
  /** Limit the value is measured against. */
  max: number;
  label: string;
  /** "budget" turns the `expense` color once usage goes over 100%; "goal" fills with the `goals` color and turns `income` green when complete. */
  tone?: "budget" | "goal";
  /** Amount still to come on top of `value` (budgets: recurring expenses), drawn as a striped segment in the bar's color (red when it would pass the limit). */
  planned?: number;
  /** Where the period stands, as a percent of the bar: draws a tick so usage can be read against time. */
  marker?: number;
  /** What the tick means; shown on hover, focus and tap, and read by screen readers. */
  markerLabel?: string;
};

export function ProgressBar({ value, max, label, tone = "budget", marker, markerLabel, planned = 0 }: ProgressBarProps) {
  const ratio = max > 0 ? value / max : 0;
  const percent = Math.min(100, Math.max(0, ratio * 100));
  const fill = tone === "goal" ? (ratio >= 1 ? "bg-income" : "bg-goals") : ratio > 1 ? "bg-expense" : "bg-primary";
  const plannedPercent = max > 0 && planned > 0 ? Math.min(100 - percent, (planned / max) * 100) : 0;
  const markerAt = marker === undefined ? 0 : Math.min(100, Math.max(0, marker));
  // Near an end of the bar the hint is anchored to that end so it never leaves the card.
  const hintAlign = markerAt < 20 ? "left-0" : markerAt > 80 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div className="relative">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="flex h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <div className={cn("h-full shrink-0", plannedPercent > 0 ? "rounded-l-full" : "rounded-full", fill)} style={{ width: `${percent}%` }} />
        {plannedPercent > 0 ? (
          <div
            data-testid="progress-planned"
            className={cn("h-full shrink-0", value + planned > max ? "bg-expense" : "bg-primary")}
            style={{ width: `${plannedPercent}%`, ...PLANNED_STRIPES }}
          />
        ) : null}
      </div>
      {marker === undefined ? null : (
        // Focusable so that a tap on a phone shows the hint like hover does with a mouse.
        <span
          tabIndex={0}
          role="img"
          aria-label={markerLabel}
          data-testid="progress-marker"
          className="group absolute -inset-y-1 z-10 -ml-2 w-4 cursor-help outline-none"
          style={{ left: `${markerAt}%` }}
        >
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-text/60 group-focus-visible:bg-primary-strong" />
          {markerLabel ? (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute bottom-full mb-1 w-max max-w-56 rounded-md bg-text px-2 py-1 text-xs font-semibold text-surface opacity-0 shadow-sm group-hover:opacity-100 group-focus:opacity-100",
                hintAlign,
              )}
            >
              {markerLabel}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}
