import { z } from "zod";
import { isoDate } from "./dates";
import { idSchema } from "./common";
import { positiveMoney } from "./money";
import { msg, msgWith } from "@/lib/i18n/translate";

const TRANSACTION_TYPES = ["income", "expense"] as const;
/** The list filter also has "transfer", which is not a transaction type. */
const FILTER_TYPES = ["income", "expense", "transfer"] as const;
const NOTE_MAX = 500;
const MAX_TAGS_PER_TRANSACTION = 20;
const SEARCH_MAX = 100;

/**
 * An optional id from a select: "" means "none". `null` is accepted too, so the schema can
 * parse its own output: the form sends already-normalized values to the Server Action, which
 * validates them again.
 */
const optionalId = z
  .union([idSchema, z.literal(""), z.null()])
  .transform((value) => (value === "" ? null : value));

export const transactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES, msg("Choose income or expense")),
  amount: positiveMoney,
  date: isoDate,
  accountId: z.uuid(msg("Choose an account")),
  categoryId: optionalId,
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_TRANSACTION, msgWith("Use at most {max} tags", { max: MAX_TAGS_PER_TRANSACTION }))
    .transform((ids) => [...new Set(ids)])
    .default([]),
  note: z
    .string()
    .trim()
    .max(NOTE_MAX, msgWith("Note must be at most {max} characters", { max: NOTE_MAX }))
    .nullable()
    .transform((value) => (value === "" ? null : value)),
});

export type TransactionInput = z.input<typeof transactionSchema>;
export type TransactionData = z.output<typeof transactionSchema>;

// --- List filters (URL search params) ---

export type TransactionFilters = {
  from?: string;
  to?: string;
  type?: (typeof FILTER_TYPES)[number];
  accountId?: string;
  /** A category by name and type, as `type:name` (for example `expense:Shopping`), or a legacy category id. */
  category?: string;
  /** A tag by name, or a legacy tag id. */
  tag?: string;
  /** Whose transactions to show: a household member's id. Absent = the whole household. */
  personId?: string;
  q?: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const filterName = z.string().trim().min(1).max(150);
const searchText = z.string().trim().min(1).max(SEARCH_MAX);
const pageNumber = z.coerce.number().int().min(1).max(100_000);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T>(schema: z.ZodType<T>, params: SearchParams, key: string): T | undefined {
  const raw = first(params[key]);
  if (!raw) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Reads filters from the URL. Invalid or empty values are ignored instead of failing the page. */
export function parseTransactionFilters(params: SearchParams): TransactionFilters {
  return {
    from: pick(isoDate, params, "from"),
    to: pick(isoDate, params, "to"),
    type: pick(z.enum(FILTER_TYPES), params, "type"),
    accountId: pick(idSchema, params, "account"),
    category: pick(filterName, params, "category"),
    tag: pick(filterName, params, "tag"),
    personId: pick(idSchema, params, "person"),
    q: pick(searchText, params, "q"),
    page: pick(pageNumber, params, "page") ?? 1,
  };
}

/** The inverse of parseTransactionFilters: the query string for a set of filters. */
export function filtersToSearchParams(
  filters: TransactionFilters,
  overrides: Partial<TransactionFilters> = {},
): URLSearchParams {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  const entries: Array<[string, string | undefined]> = [
    ["from", merged.from],
    ["to", merged.to],
    ["type", merged.type],
    ["account", merged.accountId],
    ["category", merged.category],
    ["tag", merged.tag],
    ["person", merged.personId],
    ["q", merged.q],
    ["page", merged.page > 1 ? String(merged.page) : undefined],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  return params;
}

/** How many filters are applied (paging is not a filter). */
export function activeFilterCount(filters: TransactionFilters): number {
  return [filters.from, filters.to, filters.type, filters.accountId, filters.category, filters.tag, filters.personId, filters.q].filter(Boolean).length;
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Boolean(
    filters.from || filters.to || filters.type || filters.accountId || filters.category || filters.tag || filters.personId || filters.q,
  );
}
