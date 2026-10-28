export type ReportId = "cash-flow" | "spending" | "comparison" | "balance" | "forecast";

/** The download link for a report's CSV; `params` are the report's current query parameters. */
export function exportHref(report: ReportId, params: URLSearchParams): string {
  const query = new URLSearchParams({ report });
  for (const [key, value] of params) query.set(key, value);
  return `/reports/export?${query.toString()}`;
}
