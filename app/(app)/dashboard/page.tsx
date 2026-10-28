import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/budget-period";
import { getDashboard } from "@/lib/data/dashboard";
import { greeting } from "@/lib/greeting";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Dashboard") };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const t = await getT();
  const { scope } = await searchParams;
  const user = await requireUser();
  const data = await getDashboard(undefined, scope === "mine" ? "mine" : "household");
  return (
    <>
      <PageHeader title={greeting(t, user.name, user.timezone)} />
      <DashboardView data={data} currency={user.currency} today={todayISO(user.timezone)} />
    </>
  );
}
