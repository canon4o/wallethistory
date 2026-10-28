// CSV for report exports. Text starting with = + - @ (or a tab / carriage return) would be run
// as a formula by Excel and Sheets, so it is prefixed with a quote. Numbers are never text, so a
// negative amount stays a number.

export type CsvCell = string | number | null;

const FORMULA_START = /^[=+\-@\t\r]/;

function cellText(cell: CsvCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return cell.toFixed(2);
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Rows to CSV text (CRLF line endings, as RFC 4180 asks). */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(cellText).join(",")).join("\r\n") + "\r\n";
}
