import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { Search } from "lucide-react";
import Link from "next/link";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { SignupToggle } from "@/components/admin/SignupToggle";
import { UsersTable } from "@/components/admin/UsersTable";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { isSignupEnabled } from "@/lib/auth/settings";
import { listAdminUsers } from "@/lib/data/admin";
import { adminQuery, parseAdminUserFilters } from "@/lib/validation/admin";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admin · Users") };
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const t = await getT();
  const admin = await requireAdmin();
  const filters = parseAdminUserFilters(await searchParams);
  const [result, signupEnabled] = await Promise.all([listAdminUsers(filters), isSignupEnabled()]);
  const filtered = Boolean(filters.q) || filters.status !== "all";
  const href = (page: number) => {
    const query = adminQuery({ q: filters.q, status: filters.status, page });
    return query ? `/admin/users?${query}` : "/admin/users";
  };

  return (
    <>
      <SignupToggle enabled={signupEnabled} />
      <form
        key={adminQuery({ q: filters.q, status: filters.status })}
        method="get"
        action="/admin/users"
        aria-label={t("Filter users")}
        className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
      >
        <Input id="user-search" name="q" label={t("Name or email")} type="search" defaultValue={filters.q ?? ""} />
        <Select id="user-status" name="status" label={t("Show")} defaultValue={filters.status}>
          <option value="all">{t("All users")}</option>
          <option value="admins">{t("Admins")}</option>
          <option value="blocked">{t("Blocked")}</option>
          <option value="unverified">{t("Not verified")}</option>
        </Select>
        <div className="flex gap-2">
          <Button type="submit">
            <Search className="size-4" aria-hidden="true" />
            {t("Search")}
          </Button>
          {filtered ? (
            <Link
              href="/admin/users"
              className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
            >
              {t("Clear")}
            </Link>
          ) : null}
        </div>
      </form>
      {result.items.length === 0 ? (
        <EmptyState
          title={filtered ? t("No users match") : t("No users yet")}
          description={filtered ? t("Try a different search or filter.") : undefined}
        />
      ) : (
        <UsersTable rows={result.items} timezone={admin.timezone} />
      )}
      <AdminPagination page={result.page} pageCount={result.pageCount} total={result.total} noun="user" hrefFor={href} />
    </>
  );
}
