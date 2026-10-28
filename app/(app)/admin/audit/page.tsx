import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AuditTable } from "@/components/admin/AuditTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { listAuditLog } from "@/lib/data/admin";
import { adminQuery, parseAdminLoginFilters } from "@/lib/validation/admin";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admin · Audit log") };
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const t = await getT();
  const admin = await requireAdmin();
  const { page: requested } = parseAdminLoginFilters(await searchParams);
  const result = await listAuditLog(requested);
  const href = (page: number) => {
    const query = adminQuery({ page });
    return query ? `/admin/audit?${query}` : "/admin/audit";
  };
  return (
    <>
      {result.items.length === 0 ? (
        <EmptyState title={t("No admin actions yet")} description={t("Role changes, blocks, deletions and other admin actions are listed here.")} />
      ) : (
        <AuditTable rows={result.items} timezone={admin.timezone} />
      )}
      <AdminPagination page={result.page} pageCount={result.pageCount} total={result.total} noun="action" hrefFor={href} />
    </>
  );
}
