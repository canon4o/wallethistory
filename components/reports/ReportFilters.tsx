import Link from "next/link";
import type { ReactNode } from "react";
import { Download, Search } from "lucide-react";
import type { ReportFilterOptions } from "@/lib/data/reports";
import { matchingPreset, PERIOD_PRESETS, presetRange, type PeriodPresetId } from "@/lib/reports/periods";
import { hasActiveReportFilters, reportFiltersToSearchParams, type ReportFilters as Filters } from "@/lib/validation/reports";
import { AccountSelect } from "@/components/accounts/AccountSelect";
import { CategorySelect } from "@/components/categories/CategorySelect";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getT } from "@/lib/i18n/server";

export type ReportFilterFields = {
  /** The period shortcuts, and the From / To dates unless `dates` is false. */
  period?: boolean;
  /** Show the From / To date inputs (default); false keeps the period in hidden fields. */
  dates?: boolean;
  /** Only offer these shortcuts (default: all). */
  presets?: readonly PeriodPresetId[];
  /** Category, tag and note search. Not offered where they make no sense (the balance). */
  details?: boolean;
};

type Props = {
  /** The report's own path, which the form submits to. */
  action: string;
  filters: Filters;
  options: ReportFilterOptions;
  fields: ReportFilterFields;
  today: string;
  /** Query parameters sent along as hidden fields, and kept by the shortcut and clear links. */
  keep?: Record<string, string>;
  /** Query parameters the report's own controls (children) submit; only the shortcut and clear links keep them. */
  linkParams?: Record<string, string>;
  /** Report-specific controls, shown first. */
  children?: ReactNode;
  exportHref: string;
};

const chipClass =
  "inline-flex min-h-10 items-center rounded-full border px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-primary-strong";

/**
 * A plain GET form: filters live in the URL (shareable, back-button friendly) and it works without
 * client-side JavaScript. Every report uses it, so they all narrow data the same way.
 */
export async function ReportFilters({ action, filters, options, fields, today, keep = {}, children, exportHref, linkParams = {} }: Props) {
  const t = await getT();
  const showDates = fields.dates !== false;
  const presets = PERIOD_PRESETS.filter((preset) => !fields.presets || fields.presets.includes(preset.id));
  const withPreset = (id: PeriodPresetId) => {
    const range = presetRange(id, today);
    const params = reportFiltersToSearchParams({ ...filters, range });
    for (const [key, value] of Object.entries({ ...keep, ...linkParams })) params.set(key, value);
    return `${action}?${params.toString()}`;
  };
  const activePreset = fields.period ? matchingPreset(filters.range, today) : null;
  const clearParams = new URLSearchParams({ ...keep, ...linkParams });
  if (fields.period) {
    clearParams.set("from", filters.range.start);
    clearParams.set("to", filters.range.end);
  }
  const query = clearParams.toString();

  return (
    <form
      // Uncontrolled fields: a new set of filters from the URL (such as "Clear filters") remounts the form.
      key={reportFiltersToSearchParams(filters).toString()}
      method="get"
      action={action}
      aria-label={t("Report filters")}
      className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.period ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Period shortcuts")}>
          {presets.map((preset) => (
            <Link
              key={preset.id}
              href={withPreset(preset.id)}
              aria-current={activePreset === preset.id ? "true" : undefined}
              className={`${chipClass} ${
                activePreset === preset.id
                  ? "border-primary-strong bg-primary-soft text-primary-soft-foreground"
                  : "border-border text-text hover:bg-background"
              }`}
            >
              {t(preset.label)}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {children}
        {fields.period && !showDates ? (
          <>
            <input type="hidden" name="from" value={filters.range.start} />
            <input type="hidden" name="to" value={filters.range.end} />
          </>
        ) : null}
        {fields.period && showDates ? (
          <>
            <DateInput id="report-from" name="from" label={t("From")} defaultValue={filters.range.start} />
            <DateInput id="report-to" name="to" label={t("To")} defaultValue={filters.range.end} placement="bottom-end" />
          </>
        ) : null}
        {options.people.length > 1 ? (
          <Select id="report-person" name="person" label={t("Person")} defaultValue={filters.personId ?? ""}>
            <option value="">{t("Everyone")}</option>
            {options.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.isMe ? t("Me") : person.name}
              </option>
            ))}
          </Select>
        ) : null}
        <AccountSelect
          id="report-account"
          name="account"
          label={t("Account")}
          accounts={options.accounts}
          emptyLabel={t("All accounts")}
          defaultValue={filters.accountId ?? ""}
        />
        {fields.details ? (
          <>
            <CategorySelect
              id="report-category"
              name="category"
              label={t("Category")}
              categories={options.categories.map((category) => ({ ...category, id: category.key }))}
              emptyLabel={t("All categories")}
              groupByType
              defaultValue={filters.category ?? ""}
            />
            <Select id="report-tag" name="tag" label={t("Tag")} defaultValue={filters.tag ?? ""}>
              <option value="">{t("All tags")}</option>
              {options.tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </Select>
            <div className="col-span-2">
              <Input id="report-q" name="q" label={t("Search notes")} type="search" defaultValue={filters.q ?? ""} autoComplete="off" />
            </div>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {hasActiveReportFilters(filters) ? (
          <Link
            href={query ? `${action}?${query}` : action}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
          >
            {t("Clear filters")}
          </Link>
        ) : null}
        <a
          href={exportHref}
          download
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
        >
          <Download className="size-4" aria-hidden="true" />
          {t("Export CSV")}
        </a>
        <Button type="submit">
          <Search className="size-4" aria-hidden="true" />
          {t("Apply")}
        </Button>
      </div>
    </form>
  );
}
