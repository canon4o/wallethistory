import { z } from "zod";
import { monthRange, type DateRange } from "@/lib/budget-period";
import { addMonths, monthStarts, presetRange, type PeriodPresetId } from "@/lib/reports/periods";
import { idSchema } from "./common";
import { isoDate } from "./dates";

/** A report never spans more months than this, so a typo in the URL cannot ask for centuries. */
export const MAX_REPORT_MONTHS = 36;
const SEARCH_MAX = 100;

export type ReportFilters = {
  /** The period; always set (the report's default when the URL has none). */
  range: DateRange;
  accountId?: string;
  /** Whose data to show: a household member's id. Absent = the whole household. */
  personId?: string;
  /** A category by name and type, as `type:name` (for example `expense:Shopping`). */
  category?: string;
  /** A tag by name. */
  tag?: string;
  /** Text to find in notes. */
  q?: string;
};

export type SearchParams = Record<string, string | string[] | undefined>;

const filterName = z.string().trim().min(1).max(150);
const categoryKey = z.string().trim().regex(/^(income|expense):\S.*$/).max(160);
const searchText = z.string().trim().min(1).max(SEARCH_MAX);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T>(schema: z.ZodType<T>, params: SearchParams, key: string): T | undefined {
  const raw = first(params[key]);
  if (!raw) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Valid dates only; swapped if the wrong way round; capped to MAX_REPORT_MONTHS months. */
function resolveRange(params: SearchParams, fallback: DateRange): DateRange {
  const from = pick(isoDate, params, "from");
  const to = pick(isoDate, params, "to");
  let start = from ?? fallback.start;
  let end = to ?? fallback.end;
  if (start > end) [start, end] = [end, start];
  if (monthStarts({ start, end }).length > MAX_REPORT_MONTHS) {
    start = addMonths(end, -(MAX_REPORT_MONTHS - 1));
  }
  return { start, end };
}

/** Reads report filters from the URL. Invalid or empty values are ignored instead of failing the page. */
export function parseReportFilters(
  params: SearchParams,
  defaultPreset: PeriodPresetId,
  today: string,
): ReportFilters {
  return {
    range: resolveRange(params, presetRange(defaultPreset, today)),
    accountId: pick(idSchema, params, "account"),
    personId: pick(idSchema, params, "person"),
    category: pick(categoryKey, params, "category"),
    tag: pick(filterName, params, "tag"),
    q: pick(searchText, params, "q"),
  };
}

/** The inverse of parseReportFilters: the query string for a set of filters. */
export function reportFiltersToSearchParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("from", filters.range.start);
  params.set("to", filters.range.end);
  const entries: Array<[string, string | undefined]> = [
    ["account", filters.accountId],
    ["person", filters.personId],
    ["category", filters.category],
    ["tag", filters.tag],
    ["q", filters.q],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  return params;
}

/** The narrowing filters without the period, for links between reports (each report has its own default period). */
export function carryFilterParams(filters: ReportFilters): URLSearchParams {
  const params = reportFiltersToSearchParams(filters);
  params.delete("from");
  params.delete("to");
  return params;
}

export function hasActiveReportFilters(filters: ReportFilters): boolean {
  return Boolean(filters.accountId || filters.personId || filters.category || filters.tag || filters.q);
}

// --- Spending / comparison options ---

export const REPORT_TYPES = ["expense", "income"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Expenses unless the URL asks for income. */
export function parseReportType(params: SearchParams): ReportType {
  return pick(z.enum(REPORT_TYPES), params, "type") ?? "expense";
}

// --- Period comparison ---

export type ComparisonMode = "month" | "year";

export type Comparison = {
  mode: ComparisonMode;
  /** The compared periods as typed in the URL: `2026-10` for months, `2026` for years. */
  a: string;
  b: string;
  aRange: DateRange;
  bRange: DateRange;
};

const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const yearKey = z.string().regex(/^\d{4}$/).refine((value) => Number(value) >= 1970);

function keyRange(mode: ComparisonMode, key: string): DateRange {
  return mode === "month" ? monthRange(`${key}-01`) : { start: `${key}-01-01`, end: `${key}-12-31` };
}

/** Picks two months (default: this and last month) or two years (default: this and last year). */
export function parseComparison(params: SearchParams, today: string): Comparison {
  const mode: ComparisonMode = first(params.mode) === "year" ? "year" : "month";
  const schema = mode === "month" ? monthKey : yearKey;
  const thisKey = mode === "month" ? today.slice(0, 7) : today.slice(0, 4);
  const lastKey = mode === "month" ? addMonths(today, -1).slice(0, 7) : String(Number(today.slice(0, 4)) - 1);
  const a = pick(schema, params, "a") ?? thisKey;
  const b = pick(schema, params, "b") ?? lastKey;
  return { mode, a, b, aRange: keyRange(mode, a), bRange: keyRange(mode, b) };
}
