import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BudgetAlertsForm } from "@/components/settings/BudgetAlertsForm";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { LocaleSwitch } from "@/components/layout/LocaleSwitch";
import { RegionalForm } from "@/components/settings/RegionalForm";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { requireUser } from "@/lib/auth/session";
import { listTimezones } from "@/lib/timezones";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Settings") };
}

function Section({ title, description, children, danger }: {
  title: string;
  description?: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      aria-labelledby={`section-${title}`}
      className={`flex flex-col gap-3 rounded-lg border bg-surface p-4 ${danger ? "border-expense" : "border-border"}`}
    >
      <div>
        <h2 id={`section-${title}`} className={`text-base font-bold ${danger ? "text-expense-text" : ""}`}>
          {title}
        </h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const t = await getT();
  const user = await requireUser();
  return (
    <>
      <PageHeader title={t("Settings")} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={t("Profile")}>
          <ProfileForm name={user.name} email={user.email} />
        </Section>
        <Section
          title={t("Regional")}
          description={t("Currency and timezone only change how amounts and dates are shown. Existing amounts are not converted.")}
        >
          <LocaleSwitch />
          <RegionalForm currency={user.currency} timezone={user.timezone} timezones={listTimezones()} />
        </Section>
        <Section
          title={t("Budget alerts")}
          description={t("Show a warning at the top of every page when spending in one of your budgets is close to its limit, and another when it is over.")}
        >
          <BudgetAlertsForm enabled={user.budgetAlertsEnabled} threshold={user.budgetAlertThreshold} />
        </Section>
        <Section
          title={t("Change password")}
          description={t("Changing your password signs you out of all other devices.")}
        >
          <ChangePasswordForm />
        </Section>
        <Section
          title={t("Danger zone")}
          description={t("Deleting your account permanently removes all of your data.")}
          danger
        >
          <div>
            <DeleteAccountSection />
          </div>
        </Section>
      </div>
    </>
  );
}
