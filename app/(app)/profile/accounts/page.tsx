import type { Metadata } from "next";
import { AccountsManager } from "@/components/accounts/AccountsManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { SharedAccounts } from "@/components/household/SharedAccounts";
import { requireUser } from "@/lib/auth/session";
import { listAccounts, listHouseholdAccounts } from "@/lib/data/accounts";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Accounts") };
}

export default async function AccountsPage() {
  const t = await getT();
  const user = await requireUser();
  const [accounts, shared] = await Promise.all([listAccounts(), listHouseholdAccounts()]);
  return (
    <>
      <PageHeader title={t("Accounts")} />
      <AccountsManager accounts={accounts} />
      <SharedAccounts accounts={shared} currency={user.currency} />
    </>
  );
}
