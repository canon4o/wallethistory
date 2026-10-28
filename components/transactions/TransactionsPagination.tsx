import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { filtersToSearchParams, type TransactionFilters } from "@/lib/validation/transactions";
import { getT } from "@/lib/i18n/server";

const linkClass =
  "inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm font-semibold hover:bg-background focus-visible:outline-2 focus-visible:outline-primary-strong";
const disabledClass =
  "inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold text-muted opacity-50";

export async function TransactionsPagination({
  filters,
  page,
  pageCount,
  total,
}: {
  filters: TransactionFilters;
  page: number;
  pageCount: number;
  total: number;
}) {
  const t = await getT();
  if (total === 0) return null;
  const href = (target: number) => {
    const query = filtersToSearchParams(filters, { page: target }).toString();
    return query ? `/transactions?${query}` : "/transactions";
  };
  return (
    <nav aria-label={t("Pagination")} className="mt-4 flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("Previous")}
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("Previous")}
        </span>
      )}
      <p className="text-sm text-muted" aria-live="polite">
        {t("Page")} {page} {t("of")} {pageCount} · {total} {total === 1 ? "transaction" : "transactions"}
      </p>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkClass} rel="next">
          {t("Next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          {t("Next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
