import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { HouseholdManager } from "@/components/household/HouseholdManager";
import { getHouseholdOverview } from "@/lib/data/household";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Household") };
}

export default async function HouseholdPage() {
  const t = await getT();
  const overview = await getHouseholdOverview();
  return (
    <>
      <PageHeader title={t("Household")} />
      <HouseholdManager overview={overview} />
    </>
  );
}
