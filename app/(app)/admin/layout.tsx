import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

// Everything under /admin: anyone who is not an admin gets a 404.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  await requireAdmin();
  return (
    <>
      <PageHeader title={t("Admin")} />
      {children}
    </>
  );
}
