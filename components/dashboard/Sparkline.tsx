/**
 * A tiny trend line for a tile: plain SVG, no chart library, scaled to its own minimum and maximum.
 * It only hints at the shape; the exact numbers are in the linked report.
 */
export function Sparkline({ values, label, className }: { values: number[]; label: string; className: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      // Flat data is drawn in the middle rather than stuck to an edge.
      const y = span === 0 ? 12 : 22 - ((value - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg role="img" aria-label={label} viewBox="0 0 100 24" preserveAspectRatio="none" className="mt-1 h-6 w-full overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={className}
      />
    </svg>
  );
}
