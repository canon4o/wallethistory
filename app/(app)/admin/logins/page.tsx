import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import Link from "next/link";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { LoginsTable } from "@/components/admin/LoginsTable";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { listLoginEvents } from "@/lib/data/admin";
import { adminQuery, parseAdminLoginFilters } from "@/lib/validation/admin";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admin · Logins") };
}

export default async function AdminLoginsPage({ searchParams }: PageProps<"/admin/logins">) {
  const t = await getT();
  const admin = await requireAdmin();
  const filters = parseAdminLoginFilters(await searchParams);
  const result = await listLoginEvents(filters);
  const filtered = filters.result !== "all" || Boolean(filters.userId);
  const href = (page: number) => {
    const query = adminQuery({ result: filters.result, user: filters.userId, page });
    return query ? `/admin/logins?${query}` : "/admin/logins";
  };

  return (
    <>
      <form
        key={adminQuery({ result: filters.result, user: filters.userId })}
        method="get"
        action="/admin/logins"
        aria-label={t("Filter logins")}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3"
      >
        {filters.userId ? <input type="hidden" name="user" value={filters.userId} /> : null}
        <div className="w-44">
          <Select id="login-result" name="result" label={t("Result")} defaultValue={filters.result}>
            <option value="all">{t("All attempts")}</option>
            <option value="success">{t("Signed in")}</option>
            <option value="failed">{t("Failed")}</option>
          </Select>
        </div>
        <Button type="submit">{t("Apply")}</Button>
        {filtered ? (
          <Link
            href="/admin/logins"
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
          >
            {t("Clear")}
          </Link>
        ) : null}
      </form>
      {filters.userId ? <p className="mb-2 text-sm text-muted">{t("Showing one user's attempts.")}</p> : null}
      {result.items.length === 0 ? (
        <EmptyState
          title={filtered ? t("No logins match") : t("No logins recorded yet")}
          description={t("Login history is kept for 90 days.")}
        />
      ) : (
        <LoginsTable rows={result.items} timezone={admin.timezone} />
      )}
      <AdminPagination page={result.page} pageCount={result.pageCount} total={result.total} noun="attempt" hrefFor={href} />
    </>
  );
}
