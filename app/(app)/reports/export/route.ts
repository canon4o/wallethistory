import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import {
  getBalanceOverTime,
  getCashFlow,
  getForecastData,
  getPeriodComparison,
  getSpendingByCategory,
} from "@/lib/data/reports";
import { forecastRange } from "@/lib/reports/forecast";
import { toCsv, type CsvCell } from "@/lib/reports/csv";
import { balanceRows, cashFlowRows, comparisonLabel, comparisonRows, forecastRows, spendingRows } from "@/lib/reports/export";
import {
  parseComparison,
  parseReportFilters,
  parseReportType,
} from "@/lib/validation/reports";

/** Downloads the rows a report shows as CSV, for the same filters (they come from the query string). */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const params = Object.fromEntries(query);
  const user = await requireUser();
  const today = todayISO(user.timezone);

  let rows: CsvCell[][];
  let name: string;
  switch (query.get("report")) {
    case "cash-flow": {
      const filters = parseReportFilters(params, "last-6-months", today);
      rows = cashFlowRows(await getCashFlow(filters));
      name = `cash-flow-${filters.range.start}-to-${filters.range.end}`;
      break;
    }
    case "spending": {
      const filters = parseReportFilters(params, "this-month", today);
      const type = parseReportType(params);
      rows = spendingRows(await getSpendingByCategory(filters, type));
      name = `${type === "expense" ? "spending" : "income"}-by-category-${filters.range.start}-to-${filters.range.end}`;
      break;
    }
    case "comparison": {
      const filters = parseReportFilters(params, "this-month", today);
      const comparison = parseComparison(params, today);
      const data = await getPeriodComparison(filters, comparison, parseReportType(params));
      rows = comparisonRows(data, comparisonLabel(comparison.mode, comparison.a), comparisonLabel(comparison.mode, comparison.b));
      name = `comparison-${comparison.a}-vs-${comparison.b}`;
      break;
    }
    case "balance": {
      const filters = parseReportFilters(params, "last-12-months", today);
      rows = balanceRows(await getBalanceOverTime(filters));
      name = `balance-${filters.range.start}-to-${filters.range.end}`;
      break;
    }
    case "forecast": {
      const filters = { ...parseReportFilters(params, "last-6-months", today), range: forecastRange(today) };
      rows = forecastRows(await getForecastData(filters, today));
      name = `forecast-${filters.range.start}-to-${filters.range.end}`;
      break;
    }
    default:
      return new Response("Unknown report", { status: 404 });
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wallethistory-${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
