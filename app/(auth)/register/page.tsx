import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthLink } from "@/components/auth/AuthLink";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Alert } from "@/components/ui/Alert";
import { isSignupEnabled } from "@/lib/auth/settings";
import { listTimezones } from "@/lib/timezones";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Create account") };
}

export default async function RegisterPage() {
  const t = await getT();
  // The setting can change at any time: render per request, never at build time.
  await connection();
  const open = await isSignupEnabled();
  return (
    <>
      <AuthHeading
        title={open ? t("Create your account") : t("Signups are closed")}
        subtitle={open ? t("Start tracking your money.") : undefined}
      />
      {open ? <RegisterForm timezones={listTimezones()} /> : <Alert>{t("New signups are currently closed. Please check back later.")}</Alert>}
      <span className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
        {t("Already have an account?")} <AuthLink href="/login">{t("Log in")}</AuthLink>
      </span>
    </>
  );
}
