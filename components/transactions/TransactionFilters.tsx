import Link from "next/link";
import { Search } from "lucide-react";
import type { CategoryFilterOption } from "@/lib/data/categories";
import type { AccountWithBalance } from "@/lib/data/accounts";
import { filtersToSearchParams, hasActiveFilters, type TransactionFilters } from "@/lib/validation/transactions";
import { Button } from "@/components/ui/Button";
import { CollapsibleFilters } from "@/components/ui/CollapsibleFilters";
import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AccountSelect } from "@/components/accounts/AccountSelect";
import { CategorySelect } from "@/components/categories/CategorySelect";
import { getT } from "@/lib/i18n/server";

type TransactionFiltersProps = {
  filters: TransactionFilters;
  accounts: Pick<AccountWithBalance, "id" | "name" | "icon" | "color">[];
  /** One option per category name across the household. */
  categories: CategoryFilterOption[];
  /** Tag names across the household. */
  tags: string[];
  /** Everyone in the household (including me). The Person filter shows only with 2 or more. */
  people?: Array<{ id: string; name: string; isMe: boolean }>;
};

/**
 * A plain GET form: filters live in the URL (shareable, back-button friendly) and it works
 * without client-side JavaScript. Changing a filter always goes back to page 1.
 */
export async function TransactionFilters({ filters, accounts, categories, tags, people = [] }: TransactionFiltersProps) {
  const t = await getT();
  return (
    <form
      // The fields are uncontrolled (defaultValue), so a new set of filters from the URL, such as
      // after "Clear filters", remounts the form to show the new values.
      key={filtersToSearchParams(filters, { page: 1 }).toString()}
      method="get"
      action="/transactions"
      aria-label={t("Filter transactions")}
      className="sm:mb-4 sm:grid sm:grid-cols-3 sm:gap-2 sm:rounded-lg sm:border sm:border-border sm:bg-surface sm:p-3 lg:grid-cols-4"
    >
      <CollapsibleFilters>
        <DateInput id="filter-from" name="from" label={t("From")} clearable defaultValue={filters.from ?? ""} />
        <DateInput id="filter-to" name="to" label={t("To")} clearable defaultValue={filters.to ?? ""} placement="bottom-end" />
        <Select id="filter-type" name="type" label={t("Type")} defaultValue={filters.type ?? ""}>
          <option value="">{t("All types")}</option>
          <option value="income">{t("Income")}</option>
          <option value="expense">{t("Expense")}</option>
          <option value="transfer">{t("Transfer")}</option>
        </Select>
        {people.length > 1 ? (
          <Select id="filter-person" name="person" label={t("Person")} defaultValue={filters.personId ?? ""}>
            <option value="">{t("Everyone")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.isMe ? t("Me") : person.name}
              </option>
            ))}
          </Select>
        ) : null}
        <AccountSelect
          id="filter-account"
          name="account"
          label={t("Account")}
          accounts={accounts}
          emptyLabel={t("All accounts")}
          defaultValue={filters.accountId ?? ""}
        />
        <CategorySelect
          id="filter-category"
          name="category"
          label={t("Category")}
          categories={categories.map((category) => ({ ...category, id: category.key }))}
          emptyLabel={t("All categories")}
          groupByType
          defaultValue={filters.category ?? ""}
        />
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-2">
          <div className="min-w-32 flex-1">
            <Select id="filter-tag" name="tag" label={t("Tag")} defaultValue={filters.tag ?? ""}>
              <option value="">{t("All tags")}</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-40 flex-[2]">
            <Input
              id="filter-q"
              name="q"
              label={t("Search notes")}
              type="search"
              defaultValue={filters.q ?? ""}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-3 lg:col-span-4">
          {hasActiveFilters(filters) ? (
            <Link
              href="/transactions"
              className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
            >
              {t("Clear filters")}
            </Link>
          ) : null}
          <Button type="submit">
            <Search className="size-4" aria-hidden="true" />
            {t("Apply filters")}
          </Button>
        </div>
      </CollapsibleFilters>
    </form>
  );
}
