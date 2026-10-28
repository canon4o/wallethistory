import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

const COUNTS = {
  attempt: msg("{count, plural, one {# attempt} other {# attempts}}"),
  user: msg("{count, plural, one {# user} other {# users}}"),
  action: msg("{count, plural, one {# action} other {# actions}}"),
} as const;

const linkClass =
  "inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm font-semibold hover:bg-background focus-visible:outline-2 focus-visible:outline-primary-strong";
const disabledClass =
  "inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold text-muted opacity-50";

type AdminPaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  noun: keyof typeof COUNTS;
  hrefFor: (page: number) => string;
};

export async function AdminPagination({ page, pageCount, total, noun, hrefFor }: AdminPaginationProps) {
  const t = await getT();
  if (total === 0) return null;
  return (
    <nav aria-label={t("Pagination")} className="mt-4 flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("Previous")}
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("Previous")}
        </span>
      )}
      <p className="text-center text-sm text-muted" aria-live="polite">
        {t("Page {page} of {pageCount}", { page, pageCount })} · {t(COUNTS[noun], { count: total })}
      </p>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={linkClass} rel="next">
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
